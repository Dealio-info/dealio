import type { LedgerReason } from "@/generated/prisma/enums";
import { ForbiddenError, type ServiceContext } from "@/server/context";
import { getBalance, listLedgerEntries } from "@/server/services/rewards/balance";
import { listRewards, type RewardSummary } from "@/server/services/rewards/catalog";
import {
  getAvailableBalance,
  listRedemptions,
  type RedemptionSummary,
} from "@/server/services/rewards/redemptions";
import { getBusinessProfile } from "@/server/services/tenancy/business-profile";
import {
  listOpportunities,
  type OpportunitySummary,
} from "@/server/services/opportunities/list-opportunities";

/** One line of an advocate's history: a movement of their currency, and why. */
export type ActivityLine = {
  readonly id: string;
  readonly delta: number;
  readonly reason: LedgerReason;
  readonly createdAt: Date;
  /**
   * What it was for, in words the advocate will recognise: the quest's title
   * for a credit, the reward's name for a debit or a refund. `null` for a
   * manual adjustment — its note is written by staff for staff, and passing it
   * through would publish internal commentary to a customer.
   */
  readonly label: string | null;
};

export type AdvocateDashboard = {
  readonly businessId: string;
  readonly businessName: string;
  readonly advocateId: string;
  /** `SUM(delta)` over this advocate's ledger. */
  readonly balance: number;
  /** Balance less what pending requests have already committed. */
  readonly available: number;
  /** Lifetime credit for completed quests. Spending does not reduce it. */
  readonly earned: number;
  /** Everything assigned to this advocate, newest first. */
  readonly opportunities: readonly OpportunitySummary[];
  /** What is on offer now, cheapest first. Active rewards only. */
  readonly rewards: readonly RewardSummary[];
  /** This advocate's own requests, newest first. */
  readonly redemptions: readonly RedemptionSummary[];
  /** This advocate's ledger, newest first, labelled. */
  readonly activity: readonly ActivityLine[];
};

/**
 * Everything one advocate sees for one business, in one read.
 *
 * **A composition, not new data access.** Every field comes from a service
 * that already scopes an advocate to their own rows — `listOpportunities`,
 * `listRedemptions` and `listLedgerEntries` filter to the advocate inside the
 * query, `getBalance` refuses anyone else's, `listRewards` hides the withdrawn.
 * Gathering them here means the page is only rendering, and the scoping rules
 * are stated once, in the services that own them.
 *
 * The activity labels are joined from the opportunities and redemptions loaded
 * alongside, not fetched again: an entry for this advocate can only reference
 * their own quests and requests, so everything it could point at is already
 * in hand.
 *
 * Deliberately per-business. One person can advocate for several companies,
 * and a balance earned at one cannot be spent at another, so the page shows
 * each separately rather than adding up numbers that mean nothing together.
 */
export async function getAdvocateDashboard(
  ctx: ServiceContext,
): Promise<AdvocateDashboard> {
  if (ctx.actor.kind !== "advocate") {
    throw new ForbiddenError("This view is for advocates");
  }
  const { businessId, advocateId } = ctx.actor;

  const [business, balance, available, opportunities, rewards, redemptions, ledger] =
    await Promise.all([
      getBusinessProfile(ctx),
      getBalance(ctx, { advocateId }),
      getAvailableBalance(ctx, { advocateId }),
      listOpportunities(ctx),
      listRewards(ctx),
      listRedemptions(ctx),
      listLedgerEntries(ctx, { advocateId }),
    ]);

  const questTitle = new Map(opportunities.map((o) => [o.id, o.title]));
  const rewardName = new Map(redemptions.map((r) => [r.id, r.rewardName]));

  const activity = ledger.map((line) => ({
    id: line.id,
    delta: line.delta,
    reason: line.reason,
    createdAt: line.createdAt,
    label:
      (line.opportunityId && questTitle.get(line.opportunityId)) ||
      (line.redemptionId && rewardName.get(line.redemptionId)) ||
      null,
  }));

  const earned = ledger
    .filter((line) => line.reason === "OPPORTUNITY_REWARD")
    .reduce((sum, line) => sum + line.delta, 0);

  return {
    businessId,
    businessName: business.name,
    advocateId,
    balance,
    available,
    earned,
    opportunities,
    rewards,
    redemptions,
    activity,
  };
}
