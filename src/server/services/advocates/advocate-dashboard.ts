import { ForbiddenError, NotFoundError, type ServiceContext } from "@/server/context";
import { getBalance } from "@/server/services/rewards/balance";
import {
  listOpportunities,
  type OpportunitySummary,
} from "@/server/services/opportunities/list-opportunities";

export type AdvocateDashboard = {
  readonly businessId: string;
  readonly businessName: string;
  readonly advocateId: string;
  readonly balance: number;
  /** Everything assigned to this advocate, newest first. */
  readonly opportunities: readonly OpportunitySummary[];
};

/**
 * Everything one advocate sees for one business.
 *
 * A composition over existing services rather than new data access —
 * `listOpportunities` already scopes an advocate to their own rows and
 * `getBalance` already refuses someone else's. Gathering them here keeps the
 * page a rendering concern and means the scoping rules are stated once.
 *
 * Deliberately per-business. One person can advocate for several companies, and
 * the dashboard shows each separately rather than merging them — a balance
 * earned at one company cannot be spent at another, so a combined total would
 * be a number that means nothing.
 */
export async function getAdvocateDashboard(
  ctx: ServiceContext,
): Promise<AdvocateDashboard> {
  if (ctx.actor.kind !== "advocate") {
    throw new ForbiddenError("This view is for advocates");
  }
  const { businessId, advocateId } = ctx.actor;

  const business = await ctx.db.business.findUnique({
    where: { id: businessId },
    select: { name: true },
  });
  if (!business) {
    throw new NotFoundError("Business not found");
  }

  const [balance, opportunities] = await Promise.all([
    getBalance(ctx, { advocateId }),
    listOpportunities(ctx),
  ]);

  return {
    businessId,
    businessName: business.name,
    advocateId,
    balance,
    opportunities,
  };
}
