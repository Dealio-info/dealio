import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type ServiceContext } from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeAdvocate, makeBusiness, makeUser } from "@/test/integration/fixtures";
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import { createReward } from "@/server/services/rewards/catalog";
import {
  approveRedemption,
  requestRedemption,
} from "@/server/services/rewards/redemptions";
import { getBalance, getOutstandingLiability } from "@/server/services/rewards/balance";
import { getDashboardSummary, listAdvocateBalances } from "./dashboard";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

async function scenario() {
  const [business, adminUser, repUser] = await Promise.all([
    makeBusiness(),
    makeUser(),
    makeUser(),
  ]);
  const admin: ServiceContext = {
    db: prisma,
    actor: {
      kind: "business",
      userId: adminUser.id,
      businessId: business.id,
      role: "BUSINESS_ADMIN",
    },
  };
  const rep: ServiceContext = {
    db: prisma,
    actor: {
      kind: "business",
      userId: repUser.id,
      businessId: business.id,
      role: "REP",
    },
  };

  async function advocate(name: string, status: "ACTIVE" | "INVITED" = "ACTIVE") {
    const [row, user] = await Promise.all([makeAdvocate(business.id), makeUser()]);
    await prisma.advocate.update({ where: { id: row.id }, data: { name, status } });
    const ctx: ServiceContext = {
      db: prisma,
      actor: {
        kind: "advocate",
        userId: user.id,
        businessId: business.id,
        advocateId: row.id,
      },
    };
    return { ...row, name, ctx };
  }

  type Adv = Awaited<ReturnType<typeof advocate>>;

  /**
   * Carry a quest to `target` through the real state machine, so every number
   * the dashboard reports is one the app could actually have produced.
   */
  async function quest(
    adv: Adv,
    target:
      | "PENDING_APPROVAL"
      | "REQUESTED"
      | "COMPLETED"
      | "VERIFIED"
      | "REWARDED"
      | "CANCELLED_AFTER_VERIFY",
    opts: { reward?: number; revenueCents?: bigint } = {},
  ) {
    // A rep under the default strict policy creates in PENDING_APPROVAL.
    const opp = await createOpportunity(target === "PENDING_APPROVAL" ? rep : admin, {
      advocateId: adv.id,
      type: "REFERENCE_CALL",
      title: "Reference call",
      rewardAmount: opts.reward ?? 5,
    });
    if (target === "PENDING_APPROVAL") return opp;
    const steps: Array<[ServiceContext, Parameters<typeof transitionOpportunity>[1]]> =
      [[admin, { opportunityId: opp.id, to: "REQUESTED" }]];
    if (target !== "REQUESTED") {
      steps.push(
        [adv.ctx, { opportunityId: opp.id, to: "ACCEPTED" }],
        [adv.ctx, { opportunityId: opp.id, to: "COMPLETED" }],
      );
    }
    if (["VERIFIED", "REWARDED", "CANCELLED_AFTER_VERIFY"].includes(target)) {
      steps.push([
        admin,
        {
          opportunityId: opp.id,
          to: "VERIFIED",
          influencedRevenueCents: opts.revenueCents ?? null,
        },
      ]);
    }
    if (target === "REWARDED") {
      steps.push([admin, { opportunityId: opp.id, to: "REWARDED" }]);
    }
    if (target === "CANCELLED_AFTER_VERIFY") {
      steps.push([admin, { opportunityId: opp.id, to: "CANCELLED" }]);
    }
    for (const [who, input] of steps) await transitionOpportunity(who, input);
    return opp;
  }

  return { business, admin, rep, advocate, quest };
}

describe("getDashboardSummary", () => {
  it("is all zeros for a business with nothing in it", async () => {
    const s = await scenario();

    const summary = await getDashboardSummary(s.admin);

    expect(summary.influencedRevenueCents).toBe(0n);
    expect(summary.currency).toEqual({
      awarded: 0,
      redeemed: 0,
      adjusted: 0,
      outstanding: 0,
    });
    expect(summary.attention).toEqual({
      awaitingApproval: 0,
      awaitingVerification: 0,
      redemptionsWaiting: 0,
    });
    expect(summary.advocates).toEqual({ active: 0, invited: 0, inactive: 0 });
    // Every status is present, so the page never has to guess at a missing key.
    expect(Object.values(summary.pipeline).every((n) => n === 0)).toBe(true);
    expect(Object.keys(summary.pipeline)).toHaveLength(8);
  });

  it("counts the pipeline and what is waiting on someone", async () => {
    const s = await scenario();
    const dana = await s.advocate("Dana");
    await s.quest(dana, "PENDING_APPROVAL");
    await s.quest(dana, "REQUESTED");
    await s.quest(dana, "REQUESTED");
    await s.quest(dana, "COMPLETED");
    await s.quest(dana, "REWARDED");

    const summary = await getDashboardSummary(s.admin);

    expect(summary.pipeline).toMatchObject({
      PENDING_APPROVAL: 1,
      REQUESTED: 2,
      ACCEPTED: 0,
      COMPLETED: 1,
      VERIFIED: 0,
      REWARDED: 1,
    });
    expect(summary.attention.awaitingApproval).toBe(1);
    expect(summary.attention.awaitingVerification).toBe(1);
  });

  it("totals influenced revenue from verified and rewarded quests only", async () => {
    const s = await scenario();
    const dana = await s.advocate("Dana");
    await s.quest(dana, "VERIFIED", { revenueCents: 1_000_000n });
    await s.quest(dana, "REWARDED", { revenueCents: 2_500_050n });
    // Verified, then cancelled: whatever was recorded did not stand, so it
    // must not inflate the number a business will quote to its board.
    await s.quest(dana, "CANCELLED_AFTER_VERIFY", { revenueCents: 9_999_999n });
    // Verified with no amount at all is normal and contributes nothing.
    await s.quest(dana, "VERIFIED");

    const summary = await getDashboardSummary(s.admin);

    expect(summary.influencedRevenueCents).toBe(3_500_050n);
  });

  it("reconciles: awarded − redeemed + adjustments = outstanding", async () => {
    const s = await scenario();
    const dana = await s.advocate("Dana");
    await s.quest(dana, "REWARDED", { reward: 20 });
    await s.quest(dana, "REWARDED", { reward: 5 });
    const reward = await createReward(s.admin, { name: "Voucher", cost: 8 });
    const redemption = await requestRedemption(dana.ctx, { rewardId: reward.id });
    await approveRedemption(s.admin, { redemptionId: redemption.id });
    await requestRedemption(dana.ctx, { rewardId: reward.id }); // pending only
    await prisma.ledgerEntry.create({
      data: {
        businessId: s.business.id,
        advocateId: dana.id,
        delta: -3,
        reason: "MANUAL_ADJUSTMENT",
        note: "Duplicate award, corrected",
      },
    });

    const { currency, attention } = await getDashboardSummary(s.admin);

    expect(currency).toEqual({
      awarded: 25,
      redeemed: 8,
      adjusted: -3,
      outstanding: 14,
    });
    expect(currency.awarded - currency.redeemed + currency.adjusted).toBe(
      currency.outstanding,
    );
    // And it is the same number the ledger's own sum gives, not a parallel
    // calculation that happens to agree today.
    expect(currency.outstanding).toBe(await getOutstandingLiability(s.admin));
    expect(attention.redemptionsWaiting).toBe(1);
  });

  it("nets a refunded fulfilment against redemptions, not awards", async () => {
    const s = await scenario();
    const dana = await s.advocate("Dana");
    await s.quest(dana, "REWARDED", { reward: 20 });
    const reward = await createReward(s.admin, { name: "Gift card", cost: 15 });
    const redemption = await requestRedemption(dana.ctx, { rewardId: reward.id });
    await approveRedemption(s.admin, { redemptionId: redemption.id });
    // The external order failed and the advocate got their currency back.
    // Nothing writes this yet — Tremendous fulfilment will — so it is
    // inserted directly, in the shape the ledger already allows.
    await prisma.ledgerEntry.create({
      data: {
        businessId: s.business.id,
        advocateId: dana.id,
        redemptionId: redemption.id,
        delta: 15,
        reason: "FULFILLMENT_FAILED",
      },
    });

    const { currency } = await getDashboardSummary(s.admin);

    // Counting the refund as an award would claim 35 earned for 20 of work.
    expect(currency).toEqual({
      awarded: 20,
      redeemed: 0,
      adjusted: 0,
      outstanding: 20,
    });
  });

  it("counts advocates by status", async () => {
    const s = await scenario();
    await s.advocate("A");
    await s.advocate("B");
    await s.advocate("C", "INVITED");

    const { advocates } = await getDashboardSummary(s.admin);

    expect(advocates).toEqual({ active: 2, invited: 1, inactive: 0 });
  });

  it("sees nothing of another business", async () => {
    const s = await scenario();
    const other = await scenario();
    const theirs = await other.advocate("Theirs");
    await other.quest(theirs, "REWARDED", { reward: 50, revenueCents: 7_000n });
    await other.quest(theirs, "PENDING_APPROVAL");
    const theirReward = await createReward(other.admin, { name: "Theirs", cost: 5 });
    await requestRedemption(theirs.ctx, { rewardId: theirReward.id });

    const summary = await getDashboardSummary(s.admin);

    expect(summary.influencedRevenueCents).toBe(0n);
    expect(summary.currency.outstanding).toBe(0);
    expect(summary.advocates.active).toBe(0);
    expect(Object.values(summary.pipeline).every((n) => n === 0)).toBe(true);
    expect(summary.attention).toEqual({
      awaitingApproval: 0,
      awaitingVerification: 0,
      redemptionsWaiting: 0,
    });
  });

  it("is readable by a rep but not by an advocate", async () => {
    const s = await scenario();
    const dana = await s.advocate("Dana");

    await expect(getDashboardSummary(s.rep)).resolves.toBeDefined();
    await expect(getDashboardSummary(dana.ctx)).rejects.toThrow(ForbiddenError);
  });
});

describe("listAdvocateBalances", () => {
  it("lists every advocate with their derived balance, largest first", async () => {
    const s = await scenario();
    const dana = await s.advocate("Dana");
    const eli = await s.advocate("Eli");
    const fay = await s.advocate("Fay", "INVITED");
    await s.quest(dana, "REWARDED", { reward: 5 });
    await s.quest(eli, "REWARDED", { reward: 12 });

    const rows = await listAdvocateBalances(s.admin);

    expect(rows.map((r) => [r.name, r.balance, r.status])).toEqual([
      ["Eli", 12, "ACTIVE"],
      ["Dana", 5, "ACTIVE"],
      ["Fay", 0, "INVITED"],
    ]);
    // Each one agrees with the single-advocate read.
    for (const row of rows) {
      expect(row.balance).toBe(
        await getBalance(s.admin, { advocateId: row.advocateId }),
      );
    }
    expect(rows.find((r) => r.advocateId === fay.id)?.balance).toBe(0);
  });

  it("never includes another business's advocates", async () => {
    const s = await scenario();
    const other = await scenario();
    const theirs = await other.advocate("Theirs");
    await other.quest(theirs, "REWARDED", { reward: 9 });
    await s.advocate("Mine");

    const rows = await listAdvocateBalances(s.admin);

    expect(rows.map((r) => r.name)).toEqual(["Mine"]);
  });

  it("refuses an advocate", async () => {
    const s = await scenario();
    const dana = await s.advocate("Dana");
    await expect(listAdvocateBalances(dana.ctx)).rejects.toThrow(ForbiddenError);
  });
});
