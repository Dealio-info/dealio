import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/server/context";
import { advocateActor } from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "./harness";
import { makeBusiness, makeUser } from "./fixtures";
import { inviteAdvocate } from "@/server/services/advocates/invite-advocate";
import { previewInvite } from "@/server/services/advocates/preview-invite";
import { claimInvite } from "@/server/services/advocates/claim-invite";
import { resolveIdentity } from "@/server/services/identity/resolve-identity";
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import {
  availableVerbs,
  BUSINESS_VERBS,
} from "@/server/services/opportunities/business-verbs";
import { getApprovalPolicy } from "@/server/services/tenancy/approval-policy";
import { createReward } from "@/server/services/rewards/catalog";
import {
  approveRedemption,
  requestRedemption,
} from "@/server/services/rewards/redemptions";
import { getBalance } from "@/server/services/rewards/balance";
import { getDashboardSummary } from "@/server/services/analytics/dashboard";
import { parseDollarsToCents } from "@/lib/money";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

/**
 * The plan's end-to-end walk, as one test, in the order the pages drive it.
 *
 * Each service has its own suite; this checks they compose — that an invite
 * claimed from a link really yields an identity the advocate pages accept,
 * that the verbs the quests page offers are the ones that then succeed, and
 * that the dashboard reports the result. It is the cheapest stand-in for
 * clicking through the browser, and it runs on every push.
 */
describe("the whole loop", () => {
  it("invite → claim → quest → verify with revenue → award → redeem → dashboard", async () => {
    const [business, adminUser, advocateUser] = await Promise.all([
      makeBusiness({ name: "Acme" }),
      makeUser(),
      makeUser({ email: "dana@customer.com" }),
    ]);
    await prisma.membership.create({
      data: { businessId: business.id, userId: adminUser.id, role: "BUSINESS_ADMIN" },
    });
    const admin: ServiceContext = {
      db: prisma,
      actor: {
        kind: "business",
        userId: adminUser.id,
        businessId: business.id,
        role: "BUSINESS_ADMIN",
      },
    };

    // /app/advocates: invite.
    const invitation = await inviteAdvocate(admin, {
      email: "dana@customer.com",
      name: "Dana",
    });

    // /invite/[token]: open the link (preview only), then accept.
    expect((await previewInvite(prisma, { token: invitation.token }))?.state).toBe(
      "open",
    );
    await claimInvite(prisma, { token: invitation.token, userId: advocateUser.id });
    expect(
      (
        await previewInvite(prisma, {
          token: invitation.token,
          userId: advocateUser.id,
        })
      )?.state,
    ).toBe("yours");

    // The advocate pages resolve their context from the session's identity.
    const identity = await resolveIdentity(prisma, advocateUser.supabaseUserId);
    const advocate: ServiceContext = {
      db: prisma,
      actor: advocateActor(identity, business.id),
    };

    // /app/quests: create and send.
    const policy = await getApprovalPolicy(admin);
    const quest = await createOpportunity(admin, {
      advocateId: invitation.advocateId,
      type: "REFERENCE_CALL",
      title: "Reference call with Globex",
      rewardAmount: 30,
    });
    const offered = (status: Parameters<typeof availableVerbs>[0]["status"]) =>
      availableVerbs({ status, actor: admin.actor, policy, isCreator: true });

    expect(offered("PENDING_APPROVAL")).toContain("send");
    await transitionOpportunity(admin, {
      opportunityId: quest.id,
      to: BUSINESS_VERBS.send,
    });

    // /advocate: accept and complete.
    await transitionOpportunity(advocate, { opportunityId: quest.id, to: "ACCEPTED" });
    await transitionOpportunity(advocate, { opportunityId: quest.id, to: "COMPLETED" });

    // /app/quests: verify with revenue typed as dollars, then award.
    expect(offered("COMPLETED")).toContain("verify");
    await transitionOpportunity(admin, {
      opportunityId: quest.id,
      to: BUSINESS_VERBS.verify,
      influencedRevenueCents: parseDollarsToCents("$48,200")!,
    });
    expect(offered("VERIFIED")).toContain("award");
    await transitionOpportunity(admin, {
      opportunityId: quest.id,
      to: BUSINESS_VERBS.award,
    });
    expect(offered("REWARDED")).toEqual([]);

    expect(await getBalance(advocate, { advocateId: invitation.advocateId })).toBe(30);

    // /advocate/rewards then /app/redemptions.
    const reward = await createReward(admin, { name: "Coffee card", cost: 25 });
    const redemption = await requestRedemption(advocate, { rewardId: reward.id });
    await approveRedemption(admin, { redemptionId: redemption.id });

    // /app: the dashboard tells the same story.
    const summary = await getDashboardSummary(admin);
    expect(summary.influencedRevenueCents).toBe(4_820_000n);
    expect(summary.currency).toEqual({
      awarded: 30,
      redeemed: 25,
      adjusted: 0,
      outstanding: 5,
    });
    expect(summary.pipeline.REWARDED).toBe(1);
    expect(summary.advocates).toEqual({ active: 1, invited: 0, inactive: 0 });
    expect(await getBalance(advocate, { advocateId: invitation.advocateId })).toBe(5);
  });
});
