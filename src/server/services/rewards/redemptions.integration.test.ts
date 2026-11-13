import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type ServiceContext,
} from "@/server/context";
import {
  disconnectTestPrisma,
  resetDb,
  separateTestPrisma,
  testPrisma,
} from "@/test/integration/harness";
import { makeAdvocate, makeBusiness, makeUser } from "@/test/integration/fixtures";
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import { createReward, setRewardActive, updateReward } from "./catalog";
import { getBalance, listLedgerEntries } from "./balance";
import {
  approveRedemption,
  countPendingRedemptions,
  getAvailableBalance,
  getRedemption,
  listRedemptions,
  markRedemptionDelivered,
  rejectRedemption,
  requestRedemption,
} from "./redemptions";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

async function scenario() {
  const [business, adminUser, repUser, advocateUser] = await Promise.all([
    makeBusiness(),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  const advocate = await makeAdvocate(business.id);

  const actors = {
    admin: {
      kind: "business",
      userId: adminUser.id,
      businessId: business.id,
      role: "BUSINESS_ADMIN",
    },
    rep: {
      kind: "business",
      userId: repUser.id,
      businessId: business.id,
      role: "REP",
    },
    advocate: {
      kind: "advocate",
      userId: advocateUser.id,
      businessId: business.id,
      advocateId: advocate.id,
    },
  } as const;

  const ctx = {
    admin: { db: prisma, actor: actors.admin } satisfies ServiceContext,
    rep: { db: prisma, actor: actors.rep } satisfies ServiceContext,
    advocate: { db: prisma, actor: actors.advocate } satisfies ServiceContext,
  };
  return { business, adminUser, repUser, advocate, actors, ctx };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

/**
 * Give the advocate `amount` of currency the only way the system allows: by
 * carrying an opportunity all the way to REWARDED. A test that inserted a
 * ledger row by hand would be testing a state the app cannot reach.
 */
async function fund(s: Scenario, amount: number) {
  const opp = await createOpportunity(s.ctx.admin, {
    advocateId: s.advocate.id,
    type: "REFERENCE_CALL",
    title: "Reference call",
    rewardAmount: amount,
  });
  for (const [who, to] of [
    ["admin", "REQUESTED"],
    ["advocate", "ACCEPTED"],
    ["advocate", "COMPLETED"],
    ["admin", "VERIFIED"],
    ["admin", "REWARDED"],
  ] as const) {
    await transitionOpportunity(s.ctx[who], { opportunityId: opp.id, to });
  }
  return opp;
}

async function ledgerOf(s: Scenario) {
  return listLedgerEntries(s.ctx.admin, { advocateId: s.advocate.id });
}

describe("requestRedemption", () => {
  it("records the ask and moves no currency", async () => {
    const s = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Coffee voucher", cost: 7 });

    const redemption = await requestRedemption(s.ctx.advocate, {
      rewardId: reward.id,
    });

    expect(redemption).toMatchObject({
      status: "REQUESTED",
      cost: 7,
      rewardName: "Coffee voucher",
      advocateId: s.advocate.id,
      decidedAt: null,
    });
    // Requesting is not spending.
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(10);
    expect(await ledgerOf(s)).toHaveLength(1);
  });

  it("refuses more than the advocate has", async () => {
    const s = await scenario();
    await fund(s, 5);
    const reward = await createReward(s.ctx.admin, { name: "Headphones", cost: 50 });

    await expect(
      requestRedemption(s.ctx.advocate, { rewardId: reward.id }),
    ).rejects.toThrow(ConflictError);
    expect(await prisma.redemption.count()).toBe(0);
  });

  it("refuses an advocate with no balance at all", async () => {
    const s = await scenario();
    const reward = await createReward(s.ctx.admin, { name: "Mug", cost: 1 });

    await expect(
      requestRedemption(s.ctx.advocate, { rewardId: reward.id }),
    ).rejects.toThrow(ConflictError);
  });

  it("does not let pending requests stack past the balance", async () => {
    const s = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 10 });

    await requestRedemption(s.ctx.advocate, { rewardId: reward.id });

    // The balance is still 10 — nothing has been debited — but it is already
    // committed. Without this, three requests would each look affordable and
    // two would fail at approval, which is the admin's problem to clean up.
    await expect(
      requestRedemption(s.ctx.advocate, { rewardId: reward.id }),
    ).rejects.toThrow(ConflictError);
    expect(await prisma.redemption.count()).toBe(1);
  });

  it("frees the committed currency again when a request is rejected", async () => {
    const s = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 10 });
    const first = await requestRedemption(s.ctx.advocate, { rewardId: reward.id });

    await rejectRedemption(s.ctx.admin, { redemptionId: first.id });

    expect(
      await getAvailableBalance(s.ctx.advocate, { advocateId: s.advocate.id }),
    ).toBe(10);
    await expect(
      requestRedemption(s.ctx.advocate, { rewardId: reward.id }),
    ).resolves.toMatchObject({ status: "REQUESTED" });
  });

  it("refuses a withdrawn reward", async () => {
    const s = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Retired", cost: 2 });
    await setRewardActive(s.ctx.admin, { rewardId: reward.id, isActive: false });

    await expect(
      requestRedemption(s.ctx.advocate, { rewardId: reward.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses another business's reward", async () => {
    const s = await scenario();
    const other = await scenario();
    await fund(s, 100);
    const theirs = await createReward(other.ctx.admin, { name: "Theirs", cost: 1 });

    await expect(
      requestRedemption(s.ctx.advocate, { rewardId: theirs.id }),
    ).rejects.toThrow(NotFoundError);
    expect(await prisma.redemption.count()).toBe(0);
  });

  it("refuses a business admin — only an advocate can redeem", async () => {
    const s = await scenario();
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 1 });

    await expect(
      requestRedemption(s.ctx.admin, { rewardId: reward.id }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("holds the terms it was made on when the catalog is re-priced", async () => {
    const s = await scenario();
    await fund(s, 20);
    const reward = await createReward(s.ctx.admin, { name: "Coffee voucher", cost: 5 });
    const redemption = await requestRedemption(s.ctx.advocate, {
      rewardId: reward.id,
    });

    await updateReward(s.ctx.admin, {
      rewardId: reward.id,
      name: "Coffee voucher (large)",
      cost: 15,
    });
    await approveRedemption(s.ctx.admin, { redemptionId: redemption.id });

    // Approved at the price asked, not the price now.
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(15);
    const after = await getRedemption(s.ctx.admin, redemption.id);
    expect(after).toMatchObject({ cost: 5, rewardName: "Coffee voucher" });
  });
});

describe("approveRedemption", () => {
  async function requested(s: Scenario, { fundWith = 10, cost = 7 } = {}) {
    await fund(s, fundWith);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost });
    return requestRedemption(s.ctx.advocate, { rewardId: reward.id });
  }

  it("debits the advocate in one ledger entry", async () => {
    const s = await scenario();
    const redemption = await requested(s);

    const approved = await approveRedemption(s.ctx.admin, {
      redemptionId: redemption.id,
    });

    expect(approved.status).toBe("APPROVED");
    expect(approved.decidedAt).toBeInstanceOf(Date);
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(3);

    const debits = (await ledgerOf(s)).filter((e) => e.reason === "REDEMPTION");
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({ delta: -7, redemptionId: redemption.id });

    const row = await prisma.redemption.findUniqueOrThrow({
      where: { id: redemption.id },
    });
    expect(row.decidedByUserId).toBe(s.adminUser.id);
  });

  it("refuses a rep, and moves nothing", async () => {
    const s = await scenario();
    const redemption = await requested(s);

    await expect(
      approveRedemption(s.ctx.rep, { redemptionId: redemption.id }),
    ).rejects.toThrow(ForbiddenError);

    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(10);
    expect((await ledgerOf(s)).filter((e) => e.reason === "REDEMPTION")).toHaveLength(
      0,
    );
    expect(
      (await prisma.redemption.findUniqueOrThrow({ where: { id: redemption.id } }))
        .status,
    ).toBe("REQUESTED");
  });

  it("refuses a rep even when the business delegates reward approval", async () => {
    const s = await scenario();
    // The delegation flag covers *awarding* currency. Paying it out is the
    // business spending real money, and stays with an admin either way.
    await prisma.business.update({
      where: { id: s.business.id },
      data: {
        requireAdminApprovalForRewards: false,
        requireAdminApprovalForOpportunities: false,
      },
    });
    const redemption = await requested(s);

    await expect(
      approveRedemption(s.ctx.rep, { redemptionId: redemption.id }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses the advocate approving their own request", async () => {
    const s = await scenario();
    const redemption = await requested(s);

    await expect(
      approveRedemption(s.ctx.advocate, { redemptionId: redemption.id }),
    ).rejects.toThrow(ForbiddenError);
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(10);
  });

  it("hides another business's redemption", async () => {
    const s = await scenario();
    const other = await scenario();
    const redemption = await requested(s);

    await expect(
      approveRedemption(other.ctx.admin, { redemptionId: redemption.id }),
    ).rejects.toThrow(NotFoundError);
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(10);
  });

  it("refuses a second approval and pays once", async () => {
    const s = await scenario();
    const redemption = await requested(s);
    await approveRedemption(s.ctx.admin, { redemptionId: redemption.id });

    await expect(
      approveRedemption(s.ctx.admin, { redemptionId: redemption.id }),
    ).rejects.toThrow(ConflictError);

    expect((await ledgerOf(s)).filter((e) => e.reason === "REDEMPTION")).toHaveLength(
      1,
    );
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(3);
  });

  it("refuses when the balance has fallen since the request", async () => {
    const s = await scenario();
    await fund(s, 10);
    const cheap = await createReward(s.ctx.admin, { name: "Cheap", cost: 6 });
    const first = await requestRedemption(s.ctx.advocate, { rewardId: cheap.id });
    // A second ask that was affordable when made: the request-time check saw
    // 10 − 6 = 4 available, and 4 is enough for this one.
    const cheaper = await createReward(s.ctx.admin, { name: "Cheaper", cost: 4 });
    const second = await requestRedemption(s.ctx.advocate, { rewardId: cheaper.id });

    // Now an admin manually docks the advocate, so neither ask is affordable.
    await prisma.ledgerEntry.create({
      data: {
        businessId: s.business.id,
        advocateId: s.advocate.id,
        delta: -5,
        reason: "MANUAL_ADJUSTMENT",
        note: "Duplicate award, corrected",
        actorUserId: s.adminUser.id,
      },
    });

    await expect(
      approveRedemption(s.ctx.admin, { redemptionId: first.id }),
    ).rejects.toThrow(ConflictError);

    // The balance the request was checked against is not the balance that
    // decides — this one is re-read inside the transaction. Invariant 2.
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(5);
    expect((await ledgerOf(s)).filter((e) => e.reason === "REDEMPTION")).toHaveLength(
      0,
    );
    expect(
      (await prisma.redemption.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe("REQUESTED");
    // The smaller one still fits, so the refusal was about affordability and
    // not about the redemption being poisoned.
    await expect(
      approveRedemption(s.ctx.admin, { redemptionId: second.id }),
    ).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("pays only one of two approvals racing for the same currency", async () => {
    const s = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 10 });
    const first = await requestRedemption(s.ctx.advocate, { rewardId: reward.id });
    // The second ask is written directly because the request-time check would
    // refuse it — correctly, since the first already commits the balance. Two
    // requests arriving at once can still produce this pair, because that
    // check is a courtesy and not a lock. It is the state the approval path
    // has to survive.
    const second = await prisma.redemption.create({
      data: {
        businessId: s.business.id,
        advocateId: s.advocate.id,
        rewardId: reward.id,
        cost: 10,
        rewardName: "Voucher",
      },
    });

    const other = separateTestPrisma();
    try {
      // Warm the second pool: a cold client's handshake can outlast the
      // transaction we are trying to race.
      await other.$queryRaw`SELECT 1`;

      // Hold the first approval open after it has written, so the second runs
      // its balance read while the debit exists but is not committed. That is
      // the read-then-write window, and firing both with Promise.all does not
      // reliably land inside it.
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let approvedFirst = false;
      const firstApproval = prisma.$transaction(
        async (tx) => {
          await approveRedemption(
            { db: tx, actor: s.actors.admin },
            { redemptionId: first.id },
          );
          approvedFirst = true;
          await held;
        },
        { timeout: 20_000 },
      );
      // Wait for the write to have happened before starting the contender.
      while (!approvedFirst) await new Promise((r) => setTimeout(r, 10));

      const secondApproval = approveRedemption(
        { db: other, actor: s.actors.admin },
        { redemptionId: second.id },
      );
      // Let the second get as far as it can — it should be blocked on the
      // advocate row lock, not past it.
      await new Promise((r) => setTimeout(r, 100));
      release();

      await firstApproval;
      await expect(secondApproval).rejects.toThrow(ConflictError);
    } finally {
      await other.$disconnect();
    }

    expect((await ledgerOf(s)).filter((e) => e.reason === "REDEMPTION")).toHaveLength(
      1,
    );
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(0);
    const statuses = await prisma.redemption.findMany({ select: { status: true } });
    expect(statuses.map((r) => r.status).sort()).toEqual(["APPROVED", "REQUESTED"]);
  });
});

describe("rejectRedemption", () => {
  async function requested(s: Scenario) {
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 7 });
    return requestRedemption(s.ctx.advocate, { rewardId: reward.id });
  }

  it("leaves the ledger and the balance untouched", async () => {
    const s = await scenario();
    const redemption = await requested(s);

    const rejected = await rejectRedemption(s.ctx.admin, {
      redemptionId: redemption.id,
      reason: "  Out of stock  ",
    });

    expect(rejected).toMatchObject({
      status: "REJECTED",
      failureReason: "Out of stock",
    });
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(10);
    expect((await ledgerOf(s)).filter((e) => e.reason === "REDEMPTION")).toHaveLength(
      0,
    );
  });

  it("stores no reason when none is given", async () => {
    const s = await scenario();
    const redemption = await requested(s);

    const rejected = await rejectRedemption(s.ctx.admin, {
      redemptionId: redemption.id,
      reason: "   ",
    });
    expect(rejected.failureReason).toBeNull();
  });

  it("cannot reject one already approved", async () => {
    const s = await scenario();
    const redemption = await requested(s);
    await approveRedemption(s.ctx.admin, { redemptionId: redemption.id });

    await expect(
      rejectRedemption(s.ctx.admin, { redemptionId: redemption.id }),
    ).rejects.toThrow(NotFoundError);
    expect(
      (await prisma.redemption.findUniqueOrThrow({ where: { id: redemption.id } }))
        .status,
    ).toBe("APPROVED");
  });

  it("refuses a rep and an advocate", async () => {
    const s = await scenario();
    const redemption = await requested(s);

    await expect(
      rejectRedemption(s.ctx.rep, { redemptionId: redemption.id }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      rejectRedemption(s.ctx.advocate, { redemptionId: redemption.id }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("hides another business's redemption", async () => {
    const s = await scenario();
    const other = await scenario();
    const redemption = await requested(s);

    await expect(
      rejectRedemption(other.ctx.admin, { redemptionId: redemption.id }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("markRedemptionDelivered", () => {
  async function approved(s: Scenario) {
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 7 });
    const redemption = await requestRedemption(s.ctx.advocate, {
      rewardId: reward.id,
    });
    return approveRedemption(s.ctx.admin, { redemptionId: redemption.id });
  }

  it("is bookkeeping only — no second debit", async () => {
    const s = await scenario();
    const redemption = await approved(s);

    const delivered = await markRedemptionDelivered(s.ctx.admin, {
      redemptionId: redemption.id,
      externalOrderId: "tremendous-123",
    });

    expect(delivered.status).toBe("DELIVERED");
    expect((await ledgerOf(s)).filter((e) => e.reason === "REDEMPTION")).toHaveLength(
      1,
    );
    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(3);
    const row = await prisma.redemption.findUniqueOrThrow({
      where: { id: redemption.id },
    });
    expect(row.externalOrderId).toBe("tremendous-123");
    expect(row.deliveredAt).toBeInstanceOf(Date);
  });

  it("refuses one that has not been approved", async () => {
    const s = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 7 });
    const redemption = await requestRedemption(s.ctx.advocate, {
      rewardId: reward.id,
    });

    await expect(
      markRedemptionDelivered(s.ctx.admin, { redemptionId: redemption.id }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a rep", async () => {
    const s = await scenario();
    const redemption = await approved(s);

    await expect(
      markRedemptionDelivered(s.ctx.rep, { redemptionId: redemption.id }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("reading redemptions", () => {
  it("shows an advocate only their own", async () => {
    const s = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 2 });
    const mine = await requestRedemption(s.ctx.advocate, { rewardId: reward.id });

    // A second advocate at the same business asks for the same thing.
    const sibling = await makeAdvocate(s.business.id);
    const theirs = await prisma.redemption.create({
      data: {
        businessId: s.business.id,
        advocateId: sibling.id,
        rewardId: reward.id,
        cost: 2,
        rewardName: "Voucher",
      },
    });

    expect((await listRedemptions(s.ctx.advocate)).map((r) => r.id)).toEqual([mine.id]);
    expect((await listRedemptions(s.ctx.admin)).map((r) => r.id).sort()).toEqual(
      [mine.id, theirs.id].sort(),
    );
    await expect(getRedemption(s.ctx.advocate, theirs.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("filters by status and counts what is waiting", async () => {
    const s = await scenario();
    await fund(s, 20);
    const a = await createReward(s.ctx.admin, { name: "A", cost: 5 });
    const b = await createReward(s.ctx.admin, { name: "B", cost: 5 });
    const first = await requestRedemption(s.ctx.advocate, { rewardId: a.id });
    await requestRedemption(s.ctx.advocate, { rewardId: b.id });
    await approveRedemption(s.ctx.admin, { redemptionId: first.id });

    expect(await countPendingRedemptions(s.ctx.admin)).toBe(1);
    expect(await listRedemptions(s.ctx.admin, { status: "APPROVED" })).toHaveLength(1);
    expect(await listRedemptions(s.ctx.admin, { status: "REQUESTED" })).toHaveLength(1);
  });

  it("never shows one business another's", async () => {
    const s = await scenario();
    const other = await scenario();
    await fund(s, 10);
    const reward = await createReward(s.ctx.admin, { name: "Voucher", cost: 2 });
    const mine = await requestRedemption(s.ctx.advocate, { rewardId: reward.id });

    expect(await listRedemptions(other.ctx.admin)).toEqual([]);
    expect(await countPendingRedemptions(other.ctx.admin)).toBe(0);
    await expect(getRedemption(other.ctx.admin, mine.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});
