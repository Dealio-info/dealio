import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type ServiceContext,
} from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeAdvocate, makeBusiness, makeUser } from "@/test/integration/fixtures";
import { addMember, listMembers } from "./members";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

function adminOf(businessId: string, userId: string): ServiceContext {
  return {
    db: prisma,
    actor: { kind: "business", userId, businessId, role: "BUSINESS_ADMIN" },
  };
}
function repOf(businessId: string, userId: string): ServiceContext {
  return { db: prisma, actor: { kind: "business", userId, businessId, role: "REP" } };
}
function advocateOf(
  businessId: string,
  userId: string,
  advocateId: string,
): ServiceContext {
  return { db: prisma, actor: { kind: "advocate", userId, businessId, advocateId } };
}

/** A business with an admin membership already in place. */
async function businessWithAdmin() {
  const [business, admin] = await Promise.all([makeBusiness(), makeUser()]);
  await prisma.membership.create({
    data: { businessId: business.id, userId: admin.id, role: "BUSINESS_ADMIN" },
  });
  return { business, admin };
}

describe("addMember", () => {
  it("lets an admin add a rep to their own business", async () => {
    const { business, admin } = await businessWithAdmin();
    const newcomer = await makeUser({ email: "rep@example.com" });

    const member = await addMember(adminOf(business.id, admin.id), {
      userId: newcomer.id,
      role: "REP",
    });

    expect(member).toMatchObject({
      userId: newcomer.id,
      role: "REP",
      email: "rep@example.com",
    });
  });

  it("refuses a rep", async () => {
    const { business } = await businessWithAdmin();
    const [rep, newcomer] = await Promise.all([makeUser(), makeUser()]);
    await prisma.membership.create({
      data: { businessId: business.id, userId: rep.id, role: "REP" },
    });

    await expect(
      addMember(repOf(business.id, rep.id), { userId: newcomer.id, role: "REP" }),
    ).rejects.toThrow(ForbiddenError);
    expect(await prisma.membership.count({ where: { userId: newcomer.id } })).toBe(0);
  });

  it("refuses an advocate of the same business", async () => {
    const { business } = await businessWithAdmin();
    const [user, newcomer] = await Promise.all([makeUser(), makeUser()]);
    const advocate = await makeAdvocate(business.id);

    await expect(
      addMember(advocateOf(business.id, user.id, advocate.id), {
        userId: newcomer.id,
        role: "REP",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("cannot reach another business, because the id comes from the actor", async () => {
    const { business: mine, admin } = await businessWithAdmin();
    const theirs = await makeBusiness();
    const newcomer = await makeUser();

    await addMember(adminOf(mine.id, admin.id), {
      userId: newcomer.id,
      role: "REP",
    });

    // There is no input that could have named `theirs`: `addMember` takes no
    // businessId at all. This asserts the consequence.
    expect(await prisma.membership.count({ where: { businessId: theirs.id } })).toBe(0);
  });

  it("refuses a user who does not exist", async () => {
    const { business, admin } = await businessWithAdmin();

    await expect(
      addMember(adminOf(business.id, admin.id), {
        userId: "01930000-0000-7000-8000-00000000dead",
        role: "REP",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses a duplicate rather than quietly changing the role", async () => {
    const { business, admin } = await businessWithAdmin();
    const newcomer = await makeUser();
    await addMember(adminOf(business.id, admin.id), {
      userId: newcomer.id,
      role: "REP",
    });

    await expect(
      addMember(adminOf(business.id, admin.id), {
        userId: newcomer.id,
        role: "BUSINESS_ADMIN",
      }),
    ).rejects.toThrow(ConflictError);

    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: newcomer.id, businessId: business.id },
    });
    expect(membership.role).toBe("REP");
  });

  it("allows the same user to be staff of two businesses independently", async () => {
    const first = await businessWithAdmin();
    const second = await businessWithAdmin();
    const shared = await makeUser();

    await addMember(adminOf(first.business.id, first.admin.id), {
      userId: shared.id,
      role: "REP",
    });
    await addMember(adminOf(second.business.id, second.admin.id), {
      userId: shared.id,
      role: "BUSINESS_ADMIN",
    });

    const roles = await prisma.membership.findMany({
      where: { userId: shared.id },
      select: { businessId: true, role: true },
    });
    expect(roles).toHaveLength(2);
    expect(new Set(roles.map((r) => r.role))).toEqual(
      new Set(["REP", "BUSINESS_ADMIN"]),
    );
  });
});

describe("listMembers", () => {
  it("returns only the caller's own business's staff", async () => {
    const { business, admin } = await businessWithAdmin();
    const theirs = await businessWithAdmin();
    const rep = await makeUser();
    await addMember(adminOf(business.id, admin.id), { userId: rep.id, role: "REP" });

    const members = await listMembers(adminOf(business.id, admin.id));

    expect(members.map((m) => m.userId).sort()).toEqual([admin.id, rep.id].sort());
    expect(members.map((m) => m.userId)).not.toContain(theirs.admin.id);
  });

  it("is readable by a rep, who needs to see their own team", async () => {
    const { business, admin } = await businessWithAdmin();
    const rep = await makeUser();
    await addMember(adminOf(business.id, admin.id), { userId: rep.id, role: "REP" });

    const members = await listMembers(repOf(business.id, rep.id));
    expect(members).toHaveLength(2);
  });

  it("refuses an advocate, who must not be able to enumerate the sales team", async () => {
    const { business } = await businessWithAdmin();
    const user = await makeUser();
    const advocate = await makeAdvocate(business.id);

    await expect(
      listMembers(advocateOf(business.id, user.id, advocate.id)),
    ).rejects.toThrow(ForbiddenError);
  });
});
