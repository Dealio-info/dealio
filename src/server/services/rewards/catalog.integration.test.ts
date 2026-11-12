import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type ServiceContext,
} from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeAdvocate, makeBusiness } from "@/test/integration/fixtures";
import {
  countActiveRewards,
  createReward,
  getReward,
  listRewards,
  setRewardActive,
  updateReward,
} from "./catalog";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

function adminOf(businessId: string, userId = "u-admin"): ServiceContext {
  return {
    db: prisma,
    actor: { kind: "business", userId, businessId, role: "BUSINESS_ADMIN" },
  };
}
function repOf(businessId: string, userId = "u-rep"): ServiceContext {
  return { db: prisma, actor: { kind: "business", userId, businessId, role: "REP" } };
}
function advocateOf(businessId: string, advocateId: string): ServiceContext {
  return {
    db: prisma,
    actor: { kind: "advocate", userId: "u-adv", businessId, advocateId },
  };
}

describe("createReward", () => {
  it("adds a reward to the caller's own catalog", async () => {
    const business = await makeBusiness();

    const reward = await createReward(adminOf(business.id), {
      name: "  $25 coffee card  ",
      description: "  Delivered by email  ",
      cost: 5,
    });

    expect(reward).toMatchObject({
      name: "$25 coffee card",
      description: "Delivered by email",
      cost: 5,
      isActive: true,
    });
    const row = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
    expect(row.businessId).toBe(business.id);
  });

  it("refuses a rep", async () => {
    const business = await makeBusiness();
    await expect(
      createReward(repOf(business.id), { name: "Card", cost: 5 }),
    ).rejects.toThrow(ForbiddenError);
    expect(await prisma.reward.count()).toBe(0);
  });

  it("refuses an advocate", async () => {
    const business = await makeBusiness();
    const advocate = await makeAdvocate(business.id);
    await expect(
      createReward(advocateOf(business.id, advocate.id), { name: "Card", cost: 5 }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a blank name or a nonsense cost", async () => {
    const business = await makeBusiness();
    const ctx = adminOf(business.id);

    await expect(createReward(ctx, { name: "   ", cost: 5 })).rejects.toThrow(
      ConflictError,
    );
    await expect(createReward(ctx, { name: "Card", cost: -1 })).rejects.toThrow(
      ConflictError,
    );
    await expect(createReward(ctx, { name: "Card", cost: 2.5 })).rejects.toThrow(
      ConflictError,
    );
    expect(await prisma.reward.count()).toBe(0);
  });

  it("allows a free reward, which is a legitimate thing to offer", async () => {
    const business = await makeBusiness();
    await expect(
      createReward(adminOf(business.id), { name: "Thank-you note", cost: 0 }),
    ).resolves.toMatchObject({ cost: 0 });
  });
});

describe("updateReward", () => {
  it("re-prices without touching what was already agreed", async () => {
    const business = await makeBusiness();
    const advocate = await makeAdvocate(business.id);
    const reward = await createReward(adminOf(business.id), {
      name: "$25 coffee card",
      cost: 5,
    });
    // A redemption snapshots the terms at request time.
    await prisma.redemption.create({
      data: {
        businessId: business.id,
        advocateId: advocate.id,
        rewardId: reward.id,
        rewardName: "$25 coffee card",
        cost: 5,
      },
    });

    await updateReward(adminOf(business.id), {
      rewardId: reward.id,
      name: "$50 coffee card",
      cost: 10,
    });

    const redemption = await prisma.redemption.findFirstOrThrow();
    expect(redemption.rewardName).toBe("$25 coffee card");
    expect(redemption.cost).toBe(5);
  });

  it("refuses a rep", async () => {
    const business = await makeBusiness();
    const reward = await createReward(adminOf(business.id), { name: "Card", cost: 5 });

    await expect(
      updateReward(repOf(business.id), { rewardId: reward.id, cost: 1 }),
    ).rejects.toThrow(ForbiddenError);
    const row = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
    expect(row.cost).toBe(5);
  });

  it("cannot reach another business's reward", async () => {
    const [mine, theirs] = await Promise.all([makeBusiness(), makeBusiness()]);
    const reward = await createReward(adminOf(theirs.id), { name: "Theirs", cost: 9 });

    await expect(
      updateReward(adminOf(mine.id), { rewardId: reward.id, cost: 1 }),
    ).rejects.toThrow(NotFoundError);
    const row = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
    expect(row.cost).toBe(9);
  });
});

describe("setRewardActive", () => {
  it("takes a reward off the catalog without losing its history", async () => {
    const business = await makeBusiness();
    const advocate = await makeAdvocate(business.id);
    const reward = await createReward(adminOf(business.id), {
      name: "Coffee card",
      cost: 5,
    });
    await prisma.redemption.create({
      data: {
        businessId: business.id,
        advocateId: advocate.id,
        rewardId: reward.id,
        rewardName: "Coffee card",
        cost: 5,
      },
    });

    await setRewardActive(adminOf(business.id), {
      rewardId: reward.id,
      isActive: false,
    });

    // Gone from the catalog, still joinable from the redemption.
    expect(await listRewards(adminOf(business.id))).toEqual([]);
    const redemption = await prisma.redemption.findFirstOrThrow({
      include: { reward: true },
    });
    expect(redemption.reward?.name).toBe("Coffee card");
  });

  it("can be undone", async () => {
    const business = await makeBusiness();
    const reward = await createReward(adminOf(business.id), { name: "Card", cost: 5 });
    const ctx = adminOf(business.id);

    await setRewardActive(ctx, { rewardId: reward.id, isActive: false });
    const back = await setRewardActive(ctx, { rewardId: reward.id, isActive: true });

    expect(back.isActive).toBe(true);
    expect(await listRewards(ctx)).toHaveLength(1);
  });

  it("refuses a rep and another business", async () => {
    const [mine, theirs] = await Promise.all([makeBusiness(), makeBusiness()]);
    const reward = await createReward(adminOf(mine.id), { name: "Card", cost: 5 });

    await expect(
      setRewardActive(repOf(mine.id), { rewardId: reward.id, isActive: false }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      setRewardActive(adminOf(theirs.id), { rewardId: reward.id, isActive: false }),
    ).rejects.toThrow(NotFoundError);
    const row = await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } });
    expect(row.isActive).toBe(true);
  });
});

describe("listRewards", () => {
  async function catalog() {
    const business = await makeBusiness();
    const ctx = adminOf(business.id);
    const cheap = await createReward(ctx, { name: "Sticker pack", cost: 1 });
    const mid = await createReward(ctx, { name: "Coffee card", cost: 5 });
    const retired = await createReward(ctx, { name: "Old mug", cost: 3 });
    await setRewardActive(ctx, { rewardId: retired.id, isActive: false });
    const advocate = await makeAdvocate(business.id);
    return { business, ctx, cheap, mid, retired, advocate };
  }

  it("shows staff the active catalog, cheapest first", async () => {
    const { ctx, cheap, mid } = await catalog();
    const list = await listRewards(ctx);
    expect(list.map((r) => r.id)).toEqual([cheap.id, mid.id]);
  });

  it("shows staff everything when they ask", async () => {
    const { ctx } = await catalog();
    const list = await listRewards(ctx, { includeInactive: true });
    expect(list).toHaveLength(3);
  });

  it("never shows an advocate a withdrawn reward, even if asked", async () => {
    const { business, advocate, retired } = await catalog();
    const asAdvocate = advocateOf(business.id, advocate.id);

    // The flag is the business's own view; an advocate setting it changes
    // nothing. A withdrawn reward is not theirs to see.
    const list = await listRewards(asAdvocate, { includeInactive: true });

    expect(list).toHaveLength(2);
    expect(list.map((r) => r.id)).not.toContain(retired.id);
  });

  it("never shows another business's catalog", async () => {
    const { ctx } = await catalog();
    const elsewhere = await makeBusiness();
    await createReward(adminOf(elsewhere.id), { name: "Theirs", cost: 7 });

    expect((await listRewards(ctx)).map((r) => r.name)).not.toContain("Theirs");
    expect(await listRewards(adminOf(elsewhere.id))).toHaveLength(1);
  });

  it("is readable by a rep", async () => {
    const { business } = await catalog();
    expect(await listRewards(repOf(business.id))).toHaveLength(2);
  });
});

describe("getReward and countActiveRewards", () => {
  it("refuses an advocate a withdrawn reward", async () => {
    const business = await makeBusiness();
    const advocate = await makeAdvocate(business.id);
    const reward = await createReward(adminOf(business.id), { name: "Card", cost: 5 });
    await setRewardActive(adminOf(business.id), {
      rewardId: reward.id,
      isActive: false,
    });

    // Staff can still look at it; the advocate cannot.
    await expect(getReward(adminOf(business.id), reward.id)).resolves.toBeTruthy();
    await expect(
      getReward(advocateOf(business.id, advocate.id), reward.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("counts only what is on offer, for this business", async () => {
    const business = await makeBusiness();
    const ctx = adminOf(business.id);
    await createReward(ctx, { name: "A", cost: 1 });
    const b = await createReward(ctx, { name: "B", cost: 2 });
    await setRewardActive(ctx, { rewardId: b.id, isActive: false });
    const elsewhere = await makeBusiness();
    await createReward(adminOf(elsewhere.id), { name: "C", cost: 3 });

    expect(await countActiveRewards(ctx)).toBe(1);
  });

  it("refuses an advocate the count", async () => {
    const business = await makeBusiness();
    const advocate = await makeAdvocate(business.id);
    await expect(
      countActiveRewards(advocateOf(business.id, advocate.id)),
    ).rejects.toThrow(ForbiddenError);
  });
});
