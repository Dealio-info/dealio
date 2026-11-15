import type { OpportunityStatus, OpportunityType } from "@/generated/prisma/enums";
import {
  NotFoundError,
  requireTenantContext,
  type ServiceContext,
} from "@/server/context";

export type OpportunitySummary = {
  readonly id: string;
  readonly advocateId: string;
  /**
   * Who drafted it. Needed by the business side to work out what a rep may do
   * to their own quest; harmless for an advocate to receive, since it is an
   * opaque id and they are never shown it.
   */
  readonly createdByUserId: string;
  readonly type: OpportunityType;
  readonly status: OpportunityStatus;
  readonly title: string;
  readonly rewardAmount: number;
  readonly prospectName: string | null;
  readonly prospectCompany: string | null;
  readonly influencedRevenueCents: bigint | null;
  readonly createdAt: Date;
};

/**
 * Opportunities the caller is entitled to see.
 *
 * One function for both audiences, because the scoping is the only difference
 * and writing it twice is how the two drift apart: staff see the whole
 * business, an advocate sees only what is assigned to them. The advocate
 * filter is part of the query rather than a check on the way out, so there is
 * no moment where the wrong rows exist in memory.
 */
export async function listOpportunities(
  ctx: ServiceContext,
  input: { readonly status?: OpportunityStatus; readonly advocateId?: string } = {},
): Promise<OpportunitySummary[]> {
  const actor = requireTenantContext(ctx.actor);

  return ctx.db.opportunity.findMany({
    where: {
      businessId: actor.businessId,
      ...(input.status && { status: input.status }),
      ...(actor.kind === "advocate"
        ? { advocateId: actor.advocateId }
        : input.advocateId
          ? { advocateId: input.advocateId }
          : {}),
    },
    select: {
      id: true,
      advocateId: true,
      createdByUserId: true,
      type: true,
      status: true,
      title: true,
      rewardAmount: true,
      prospectName: true,
      prospectCompany: true,
      influencedRevenueCents: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export type OpportunityDetail = OpportunitySummary & {
  readonly description: string | null;
  readonly prospectEmail: string | null;
  readonly createdByUserId: string;
  readonly events: ReadonlyArray<{
    readonly fromStatus: OpportunityStatus | null;
    readonly toStatus: OpportunityStatus;
    readonly actorUserId: string | null;
    readonly note: string | null;
    readonly createdAt: Date;
  }>;
};

/** One opportunity with its audit trail, scoped the same way. */
export async function getOpportunity(
  ctx: ServiceContext,
  opportunityId: string,
): Promise<OpportunityDetail> {
  const actor = requireTenantContext(ctx.actor);

  const opportunity = await ctx.db.opportunity.findFirst({
    where: {
      id: opportunityId,
      businessId: actor.businessId,
      ...(actor.kind === "advocate" && { advocateId: actor.advocateId }),
    },
    select: {
      id: true,
      advocateId: true,
      type: true,
      status: true,
      title: true,
      description: true,
      rewardAmount: true,
      prospectName: true,
      prospectCompany: true,
      prospectEmail: true,
      influencedRevenueCents: true,
      createdAt: true,
      createdByUserId: true,
      events: {
        select: {
          fromStatus: true,
          toStatus: true,
          actorUserId: true,
          note: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!opportunity) {
    throw new NotFoundError("No such opportunity");
  }
  return opportunity;
}
