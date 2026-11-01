import { randomUUID } from "node:crypto";
import { testPrisma } from "./harness";

/**
 * Minimal fixture builders. Each takes overrides so a test can state only what
 * it cares about, which keeps the assertions readable.
 */

export async function makeUser(overrides: { email?: string; name?: string } = {}) {
  return testPrisma().user.create({
    data: {
      supabaseUserId: randomUUID(),
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      name: overrides.name ?? "Test User",
    },
  });
}

export async function makeBusiness(
  overrides: {
    name?: string;
    requireAdminApprovalForOpportunities?: boolean;
    requireAdminApprovalForRewards?: boolean;
  } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  return testPrisma().business.create({
    data: {
      name: overrides.name ?? `Business ${suffix}`,
      slug: `business-${suffix}`,
      ...(overrides.requireAdminApprovalForOpportunities !== undefined && {
        requireAdminApprovalForOpportunities:
          overrides.requireAdminApprovalForOpportunities,
      }),
      ...(overrides.requireAdminApprovalForRewards !== undefined && {
        requireAdminApprovalForRewards: overrides.requireAdminApprovalForRewards,
      }),
    },
  });
}

export async function makeAdvocate(
  businessId: string,
  overrides: { email?: string } = {},
) {
  return testPrisma().advocate.create({
    data: {
      businessId,
      email: overrides.email ?? `advocate-${randomUUID()}@example.com`,
      name: "Test Advocate",
    },
  });
}

export async function makeOpportunity(
  args: { businessId: string; advocateId: string; createdByUserId: string },
  overrides: { rewardAmount?: number } = {},
) {
  return testPrisma().opportunity.create({
    data: {
      businessId: args.businessId,
      advocateId: args.advocateId,
      createdByUserId: args.createdByUserId,
      type: "REFERENCE_CALL",
      title: "Reference call for Acme",
      rewardAmount: overrides.rewardAmount ?? 5,
    },
  });
}

/** A business with an admin user, a membership and one advocate. */
export async function makeTenant() {
  const [business, user] = await Promise.all([makeBusiness(), makeUser()]);
  const [membership, advocate] = await Promise.all([
    testPrisma().membership.create({
      data: { businessId: business.id, userId: user.id, role: "BUSINESS_ADMIN" },
    }),
    makeAdvocate(business.id),
  ]);
  return { business, user, membership, advocate };
}

/** Grant a user Dealio-staff status. */
export async function makePlatformStaff(userId: string) {
  return testPrisma().platformStaff.create({ data: { userId } });
}
