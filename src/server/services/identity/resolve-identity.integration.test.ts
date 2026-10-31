import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ForbiddenError,
  UnauthenticatedError,
  advocateActor,
  businessActor,
  platformStaffActor,
  soleTenantContext,
} from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeAdvocate, makeBusiness, makeUser } from "@/test/integration/fixtures";
import { resolveIdentity } from "./resolve-identity";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

/** Claim an advocate record for a user, as the invite flow will. */
async function claim(advocateId: string, userId: string, status = "ACTIVE" as const) {
  return prisma.advocate.update({
    where: { id: advocateId },
    data: { userId, status },
  });
}

describe("resolveIdentity", () => {
  it("refuses a Supabase user with no account", async () => {
    await expect(
      resolveIdentity(prisma, "01930000-0000-7000-8000-00000000ffff"),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("resolves a business member", async () => {
    const [user, business] = await Promise.all([makeUser(), makeBusiness()]);
    await prisma.membership.create({
      data: { userId: user.id, businessId: business.id, role: "BUSINESS_ADMIN" },
    });

    const identity = await resolveIdentity(prisma, user.supabaseUserId);

    expect(identity.user.id).toBe(user.id);
    expect(identity.isPlatformStaff).toBe(false);
    expect(identity.memberships).toEqual([
      { businessId: business.id, role: "BUSINESS_ADMIN" },
    ]);
    expect(identity.advocates).toEqual([]);
    expect(businessActor(identity, business.id).role).toBe("BUSINESS_ADMIN");
  });

  it("resolves a claimed advocate", async () => {
    const [user, business] = await Promise.all([makeUser(), makeBusiness()]);
    const advocate = await makeAdvocate(business.id);
    await claim(advocate.id, user.id);

    const identity = await resolveIdentity(prisma, user.supabaseUserId);

    expect(identity.advocates).toEqual([
      { advocateId: advocate.id, businessId: business.id },
    ]);
    expect(advocateActor(identity, business.id).advocateId).toBe(advocate.id);
  });

  it("ignores an unclaimed invite", async () => {
    // An advocate row exists for the email but has never been claimed, so it
    // has no userId and must not grant anyone a context.
    const [user, business] = await Promise.all([makeUser(), makeBusiness()]);
    await makeAdvocate(business.id, { email: user.email });

    const identity = await resolveIdentity(prisma, user.supabaseUserId);
    expect(identity.advocates).toEqual([]);
  });

  it("revokes access when an advocate is deactivated", async () => {
    const [user, business] = await Promise.all([makeUser(), makeBusiness()]);
    const advocate = await makeAdvocate(business.id);
    await claim(advocate.id, user.id);

    expect((await resolveIdentity(prisma, user.supabaseUserId)).advocates).toHaveLength(
      1,
    );

    await prisma.advocate.update({
      where: { id: advocate.id },
      data: { status: "INACTIVE" },
    });

    const after = await resolveIdentity(prisma, user.supabaseUserId);
    expect(after.advocates).toEqual([]);
    expect(() => advocateActor(after, business.id)).toThrow(ForbiddenError);
  });

  it("resolves platform staff without granting any business scope", async () => {
    const user = await makeUser();
    await prisma.platformStaff.create({ data: { userId: user.id } });

    const identity = await resolveIdentity(prisma, user.supabaseUserId);

    expect(identity.isPlatformStaff).toBe(true);
    expect(platformStaffActor(identity).kind).toBe("platform_staff");
    // Invariant 6: being Dealio staff confers nothing inside a customer.
    expect(identity.memberships).toEqual([]);
    expect(identity.advocates).toEqual([]);
    expect(() => soleTenantContext(identity)).toThrow(ForbiddenError);
  });

  it("keeps two businesses separate for one person, and refuses to guess", async () => {
    const [user, a, b] = await Promise.all([
      makeUser(),
      makeBusiness(),
      makeBusiness(),
    ]);
    await prisma.membership.createMany({
      data: [
        { userId: user.id, businessId: a.id, role: "REP" },
        { userId: user.id, businessId: b.id, role: "BUSINESS_ADMIN" },
      ],
    });

    const identity = await resolveIdentity(prisma, user.supabaseUserId);

    expect(identity.memberships).toHaveLength(2);
    expect(businessActor(identity, a.id).role).toBe("REP");
    expect(businessActor(identity, b.id).role).toBe("BUSINESS_ADMIN");
    // Ambiguous, so it must not silently pick one.
    expect(() => soleTenantContext(identity)).toThrow(ForbiddenError);
  });

  it("handles being staff at one business and an advocate of another", async () => {
    const [user, employer, vendor] = await Promise.all([
      makeUser(),
      makeBusiness(),
      makeBusiness(),
    ]);
    await prisma.membership.create({
      data: { userId: user.id, businessId: employer.id, role: "REP" },
    });
    const advocate = await makeAdvocate(vendor.id);
    await claim(advocate.id, user.id);

    const identity = await resolveIdentity(prisma, user.supabaseUserId);

    expect(businessActor(identity, employer.id).kind).toBe("business");
    expect(advocateActor(identity, vendor.id).kind).toBe("advocate");
    // Neither capacity leaks into the other.
    expect(() => businessActor(identity, vendor.id)).toThrow(ForbiddenError);
    expect(() => advocateActor(identity, employer.id)).toThrow(ForbiddenError);
  });

  it("runs inside a caller's transaction", async () => {
    // Services take a Db handle rather than the singleton precisely so they can
    // compose into one transaction — invariant 1 depends on it.
    const [user, business] = await Promise.all([makeUser(), makeBusiness()]);
    await prisma.membership.create({
      data: { userId: user.id, businessId: business.id, role: "REP" },
    });

    const identity = await prisma.$transaction((tx) =>
      resolveIdentity(tx, user.supabaseUserId),
    );
    expect(identity.memberships).toHaveLength(1);
  });
});
