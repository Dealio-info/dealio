import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeUser } from "@/test/integration/fixtures";
import { onboardBusiness, onboardPlatformStaff } from "./onboard";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

/** What `provisionAuthUser` would return, minus the Supabase round trip. */
function authUser(email: string) {
  return { supabaseUserId: randomUUID(), email };
}

async function existingStaff(email = "staff@dealio.info") {
  const user = await makeUser({ email });
  await prisma.platformStaff.create({ data: { userId: user.id } });
  return user;
}

describe("onboardPlatformStaff", () => {
  it("creates the user and grants staff in one call", async () => {
    const auth = authUser("new@dealio.info");

    const result = await onboardPlatformStaff(prisma, {
      supabaseUserId: auth.supabaseUserId,
      email: auth.email,
      name: "New Staff",
    });

    expect(result.alreadyHeld).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.email).toBe("new@dealio.info");
    expect(user.name).toBe("New Staff");
  });

  it("is safe to re-run for the same person", async () => {
    const auth = authUser("new@dealio.info");
    await onboardPlatformStaff(prisma, { ...auth });

    const again = await onboardPlatformStaff(prisma, { ...auth });

    expect(again.alreadyHeld).toBe(true);
    expect(await prisma.platformStaff.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("onboardBusiness", () => {
  const base = {
    name: "Acme Corp",
    slug: "acme-corp",
    requireAdminApprovalForOpportunities: true,
    requireAdminApprovalForRewards: true,
  };

  it("creates the admin's user, the business and the admin membership", async () => {
    const staff = await existingStaff();
    const auth = authUser("ceo@acme.com");

    const result = await onboardBusiness(prisma, {
      ...base,
      supabaseUserId: auth.supabaseUserId,
      adminEmail: auth.email,
      adminName: "Avery CEO",
    });

    expect(result.actingStaffUserId).toBe(staff.id);
    const membership = await prisma.membership.findFirstOrThrow({
      where: { businessId: result.business.id },
    });
    expect(membership).toMatchObject({
      userId: result.adminUserId,
      role: "BUSINESS_ADMIN",
    });
  });

  it("carries the delegated policy through", async () => {
    await existingStaff();
    const auth = authUser("ceo@globex.com");

    const result = await onboardBusiness(prisma, {
      ...base,
      name: "Globex",
      slug: "globex",
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
      supabaseUserId: auth.supabaseUserId,
      adminEmail: auth.email,
    });

    expect(result.business.requireAdminApprovalForOpportunities).toBe(false);
    expect(result.business.requireAdminApprovalForRewards).toBe(false);
  });

  it("refuses before writing anything when there is no staff member", async () => {
    const auth = authUser("ceo@acme.com");

    await expect(
      onboardBusiness(prisma, {
        ...base,
        supabaseUserId: auth.supabaseUserId,
        adminEmail: auth.email,
      }),
    ).rejects.toThrow(NotFoundError);

    // The order matters: resolving the actor first means a run that cannot be
    // attributed leaves no user behind to clean up.
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.business.count()).toBe(0);
  });

  it("refuses to guess between two staff members", async () => {
    await existingStaff("a@dealio.info");
    await existingStaff("b@dealio.info");
    const auth = authUser("ceo@acme.com");

    await expect(
      onboardBusiness(prisma, {
        ...base,
        supabaseUserId: auth.supabaseUserId,
        adminEmail: auth.email,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("attributes the run to the named staff member", async () => {
    await existingStaff("a@dealio.info");
    const b = await existingStaff("b@dealio.info");
    const auth = authUser("ceo@acme.com");

    const result = await onboardBusiness(prisma, {
      ...base,
      supabaseUserId: auth.supabaseUserId,
      adminEmail: auth.email,
      actingStaffEmail: "b@dealio.info",
    });

    expect(result.actingStaffUserId).toBe(b.id);
  });

  it("leaves no user behind when the slug collides, inside a transaction", async () => {
    await existingStaff();
    const first = authUser("ceo@acme.com");
    await prisma.$transaction((tx) =>
      onboardBusiness(tx, {
        ...base,
        supabaseUserId: first.supabaseUserId,
        adminEmail: first.email,
      }),
    );

    const second = authUser("other@elsewhere.com");
    await expect(
      prisma.$transaction((tx) =>
        onboardBusiness(tx, {
          ...base,
          supabaseUserId: second.supabaseUserId,
          adminEmail: second.email,
        }),
      ),
    ).rejects.toThrow(ConflictError);

    // This is why the script wraps the chain in a transaction: without one,
    // the second admin's User row would survive the failed business creation
    // and they would be able to sign in to nothing.
    expect(await prisma.user.count({ where: { email: "other@elsewhere.com" } })).toBe(
      0,
    );
    expect(await prisma.business.count()).toBe(1);
  });

  it("re-running for an existing admin does not duplicate their user", async () => {
    await existingStaff();
    const auth = authUser("ceo@acme.com");
    await onboardBusiness(prisma, {
      ...base,
      supabaseUserId: auth.supabaseUserId,
      adminEmail: auth.email,
    });

    const second = await onboardBusiness(prisma, {
      ...base,
      name: "Acme Two",
      slug: "acme-two",
      supabaseUserId: auth.supabaseUserId,
      adminEmail: auth.email,
    });

    expect(await prisma.user.count({ where: { email: "ceo@acme.com" } })).toBe(1);
    const memberships = await prisma.membership.findMany({
      where: { userId: second.adminUserId },
    });
    expect(memberships).toHaveLength(2);
  });
});
