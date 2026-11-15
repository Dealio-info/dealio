import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeBusiness, makeUser } from "@/test/integration/fixtures";
import { inviteAdvocate } from "./invite-advocate";
import { claimInvite } from "./claim-invite";
import { getAdvocateDashboard } from "./advocate-dashboard";
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import { createReward, setRewardActive } from "@/server/services/rewards/catalog";
import {
  approveRedemption,
  requestRedemption,
} from "@/server/services/rewards/redemptions";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

/**
 * A business with an admin, plus a helper that turns an email into a claimed
 * advocate with their own context. Everything below is built through the real
 * services, so the dashboard is tested against states the app can produce.
 */
async function business(name: string) {
  const [row, adminUser] = await Promise.all([makeBusiness({ name }), makeUser()]);
  const admin: ServiceContext = {
    db: prisma,
    actor: {
      kind: "business",
      userId: adminUser.id,
      businessId: row.id,
      role: "BUSINESS_ADMIN",
    },
  };

  async function advocate(email: string) {
    const invite = await inviteAdvocate(admin, { email });
    const user = await makeUser();
    await claimInvite(prisma, { token: invite.token, userId: user.id });
    const ctx: ServiceContext = {
      db: prisma,
      actor: {
        kind: "advocate",
        userId: user.id,
        businessId: row.id,
        advocateId: invite.advocateId,
      },
    };
    return { id: invite.advocateId, ctx };
  }
  type Advocate = Awaited<ReturnType<typeof advocate>>;

  /** Ask, have them do it, verify, pay. */
  async function earn(who: Advocate, title: string, amount: number) {
    const opp = await createOpportunity(admin, {
      advocateId: who.id,
      type: "TESTIMONIAL",
      title,
      rewardAmount: amount,
    });
    await transitionOpportunity(admin, { opportunityId: opp.id, to: "REQUESTED" });
    await transitionOpportunity(who.ctx, { opportunityId: opp.id, to: "ACCEPTED" });
    await transitionOpportunity(who.ctx, { opportunityId: opp.id, to: "COMPLETED" });
    await transitionOpportunity(admin, { opportunityId: opp.id, to: "VERIFIED" });
    await transitionOpportunity(admin, { opportunityId: opp.id, to: "REWARDED" });
    return opp;
  }

  return { row, admin, advocate, earn };
}

describe("getAdvocateDashboard", () => {
  it("shows one advocate only their own quests, claims and activity", async () => {
    const acme = await business("Acme");
    const [me, sibling] = await Promise.all([
      acme.advocate("me@customer.com"),
      acme.advocate("sibling@customer.com"),
    ]);
    const voucher = await createReward(acme.admin, { name: "Voucher", cost: 4 });

    await acme.earn(me, "My testimonial", 10);
    const mine = await requestRedemption(me.ctx, { rewardId: voucher.id });

    // Everything the sibling has must stay invisible to me.
    await acme.earn(sibling, "Sibling's case study", 50);
    const theirs = await requestRedemption(sibling.ctx, { rewardId: voucher.id });
    await approveRedemption(acme.admin, { redemptionId: theirs.id });

    // And so must another business entirely, even with the same person in it.
    const globex = await business("Globex");
    const meAtGlobex = await globex.advocate("me@customer.com");
    await globex.earn(meAtGlobex, "Globex intro", 99);

    const dash = await getAdvocateDashboard(me.ctx);

    expect(dash.businessName).toBe("Acme");
    expect(dash.opportunities.map((o) => o.title)).toEqual(["My testimonial"]);
    expect(dash.redemptions.map((r) => r.id)).toEqual([mine.id]);
    expect(dash.activity.map((a) => a.label)).toEqual(["My testimonial"]);
    expect(dash.balance).toBe(10);
    expect(dash.earned).toBe(10);
  });

  it("separates what is earned, what is held for a request and what is free", async () => {
    const acme = await business("Acme");
    const me = await acme.advocate("me@customer.com");
    await acme.earn(me, "First", 10);
    await acme.earn(me, "Second", 15);
    const card = await createReward(acme.admin, { name: "Gift card", cost: 12 });
    const mug = await createReward(acme.admin, { name: "Mug", cost: 3 });

    const spent = await requestRedemption(me.ctx, { rewardId: card.id });
    await approveRedemption(acme.admin, { redemptionId: spent.id });
    await requestRedemption(me.ctx, { rewardId: mug.id }); // waiting

    const dash = await getAdvocateDashboard(me.ctx);

    // Earned is lifetime credit: spending does not reduce it.
    expect(dash.earned).toBe(25);
    expect(dash.balance).toBe(13);
    // Free to spend excludes what a pending request has committed.
    expect(dash.available).toBe(10);
  });

  it("labels activity from the records it already has, newest first", async () => {
    const acme = await business("Acme");
    const me = await acme.advocate("me@customer.com");
    await acme.earn(me, "Reference call with Globex", 20);
    const card = await createReward(acme.admin, { name: "Coffee card", cost: 5 });
    const r = await requestRedemption(me.ctx, { rewardId: card.id });
    await approveRedemption(acme.admin, { redemptionId: r.id });
    await prisma.ledgerEntry.create({
      data: {
        businessId: acme.row.id,
        advocateId: me.id,
        delta: -2,
        reason: "MANUAL_ADJUSTMENT",
        note: "Internal: double-credit from the March import",
      },
    });

    const { activity } = await getAdvocateDashboard(me.ctx);

    expect(activity.map((a) => [a.reason, a.delta, a.label])).toEqual([
      // An admin's correction note is written for colleagues, not for the
      // advocate, so it is not passed through.
      ["MANUAL_ADJUSTMENT", -2, null],
      ["REDEMPTION", -5, "Coffee card"],
      ["OPPORTUNITY_REWARD", 20, "Reference call with Globex"],
    ]);
    expect(JSON.stringify(activity)).not.toContain("Internal");
  });

  it("offers only the rewards currently on the catalog", async () => {
    const acme = await business("Acme");
    const me = await acme.advocate("me@customer.com");
    await createReward(acme.admin, { name: "Live", cost: 5 });
    const retired = await createReward(acme.admin, { name: "Retired", cost: 1 });
    await setRewardActive(acme.admin, { rewardId: retired.id, isActive: false });
    const other = await business("Globex");
    await createReward(other.admin, { name: "Theirs", cost: 1 });

    const { rewards } = await getAdvocateDashboard(me.ctx);

    expect(rewards.map((r) => r.name)).toEqual(["Live"]);
  });
});
