import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ForbiddenError,
  canPublishOpportunity,
  canRewardOpportunity,
  type ServiceContext,
} from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeAdvocate, makeBusiness, makeUser } from "@/test/integration/fixtures";
import { getApprovalPolicy, updateApprovalPolicy } from "./approval-policy";

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

describe("getApprovalPolicy", () => {
  it("reads both flags from the business row", async () => {
    const [business, user] = await Promise.all([
      makeBusiness({
        requireAdminApprovalForOpportunities: false,
        requireAdminApprovalForRewards: true,
      }),
      makeUser(),
    ]);

    const policy = await getApprovalPolicy(adminOf(business.id, user.id));

    expect(policy.requireAdminApprovalForOpportunities).toBe(false);
    expect(policy.requireAdminApprovalForRewards).toBe(true);
  });

  it("is readable by a rep, so the UI can explain what will happen", async () => {
    const [business, rep] = await Promise.all([makeBusiness(), makeUser()]);

    const policy = await getApprovalPolicy(repOf(business.id, rep.id));
    expect(policy.requireAdminApprovalForOpportunities).toBe(true);
  });

  it("refuses an advocate", async () => {
    const [business, user] = await Promise.all([makeBusiness(), makeUser()]);
    const advocate = await makeAdvocate(business.id);

    await expect(
      getApprovalPolicy({
        db: prisma,
        actor: {
          kind: "advocate",
          userId: user.id,
          businessId: business.id,
          advocateId: advocate.id,
        },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("reads only the caller's own business", async () => {
    const [mine, theirs, user] = await Promise.all([
      makeBusiness({ requireAdminApprovalForRewards: true }),
      makeBusiness({ requireAdminApprovalForRewards: false }),
      makeUser(),
    ]);

    const policy = await getApprovalPolicy(adminOf(mine.id, user.id));
    expect(policy.requireAdminApprovalForRewards).toBe(true);

    const untouched = await prisma.business.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(untouched.requireAdminApprovalForRewards).toBe(false);
  });
});

describe("updateApprovalPolicy", () => {
  it("lets an admin delegate both decisions to reps", async () => {
    const [business, admin] = await Promise.all([makeBusiness(), makeUser()]);

    const policy = await updateApprovalPolicy(adminOf(business.id, admin.id), {
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
    });

    expect(policy.requireAdminApprovalForOpportunities).toBe(false);
    expect(policy.requireAdminApprovalForRewards).toBe(false);
  });

  it("updates the two flags independently", async () => {
    const [business, admin] = await Promise.all([makeBusiness(), makeUser()]);

    const policy = await updateApprovalPolicy(adminOf(business.id, admin.id), {
      requireAdminApprovalForRewards: false,
    });

    expect(policy.requireAdminApprovalForOpportunities).toBe(true);
    expect(policy.requireAdminApprovalForRewards).toBe(false);
  });

  it("refuses a rep — this is invariant 4", async () => {
    const [business, rep] = await Promise.all([makeBusiness(), makeUser()]);

    await expect(
      updateApprovalPolicy(repOf(business.id, rep.id), {
        requireAdminApprovalForOpportunities: false,
      }),
    ).rejects.toThrow(ForbiddenError);

    // And nothing moved. A rep who could flip this flag would be granting
    // themselves the authority it governs.
    const after = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(after.requireAdminApprovalForOpportunities).toBe(true);
  });

  it("changes what a rep may do, on the next action", async () => {
    const [business, admin] = await Promise.all([makeBusiness(), makeUser()]);
    const rep = {
      kind: "business",
      userId: "u",
      businessId: business.id,
      role: "REP",
    } as const;

    const strict = await getApprovalPolicy(adminOf(business.id, admin.id));
    expect(canPublishOpportunity(rep, strict)).toBe(false);
    expect(canRewardOpportunity(rep, strict)).toBe(false);

    await updateApprovalPolicy(adminOf(business.id, admin.id), {
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
    });

    const delegated = await getApprovalPolicy(adminOf(business.id, admin.id));
    expect(canPublishOpportunity(rep, delegated)).toBe(true);
    expect(canRewardOpportunity(rep, delegated)).toBe(true);
  });

  it("treats an empty patch as a no-op", async () => {
    const [business, admin] = await Promise.all([makeBusiness(), makeUser()]);

    const policy = await updateApprovalPolicy(adminOf(business.id, admin.id), {});

    expect(policy.requireAdminApprovalForOpportunities).toBe(true);
    expect(policy.requireAdminApprovalForRewards).toBe(true);
  });

  it("leaves another business's policy alone", async () => {
    const [mine, theirs, admin] = await Promise.all([
      makeBusiness(),
      makeBusiness(),
      makeUser(),
    ]);

    await updateApprovalPolicy(adminOf(mine.id, admin.id), {
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
    });

    const untouched = await prisma.business.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(untouched.requireAdminApprovalForOpportunities).toBe(true);
    expect(untouched.requireAdminApprovalForRewards).toBe(true);
  });
});
