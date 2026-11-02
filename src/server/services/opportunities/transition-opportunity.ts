import { Prisma } from "@/generated/prisma/client";
import type { OpportunityStatus } from "@/generated/prisma/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  approvalPolicyFromBusiness,
  requireTenantContext,
  type ServiceContext,
} from "@/server/context";
import { inTransaction } from "@/server/db";
import { creditForOpportunity } from "@/server/services/rewards/credit-for-opportunity";
import { canTransition, isLegalTransition } from "./transitions";

export type TransitionOpportunityInput = {
  readonly opportunityId: string;
  readonly to: OpportunityStatus;
  readonly note?: string | null;
  /**
   * Integer cents. Only accepted on `COMPLETED → VERIFIED`, which is when the
   * business is looking at what the advocacy actually influenced.
   */
  readonly influencedRevenueCents?: bigint | null;
};

/** Which timestamp each status stamps. */
const STAMPS: Partial<Record<OpportunityStatus, string>> = {
  REQUESTED: "requestedAt",
  ACCEPTED: "acceptedAt",
  COMPLETED: "completedAt",
  VERIFIED: "verifiedAt",
  REWARDED: "rewardedAt",
  DECLINED: "closedAt",
  CANCELLED: "closedAt",
};

/**
 * The only way an opportunity's status changes. Invariant 3.
 *
 * Three things happen atomically: the status moves, its timestamp is stamped,
 * and an `OpportunityEvent` records who did it. They are one nested write
 * rather than three statements, and the `where` clause carries the expected
 * current status — so a second concurrent attempt finds nothing to update
 * instead of overwriting the first.
 *
 * On `VERIFIED → REWARDED` a fourth thing happens in the same transaction: the
 * advocate is credited. That is invariant 1 — the status saying an advocate was
 * rewarded and the ledger row that pays them cannot be separated, because a
 * crash between the two would otherwise leave a reward that reads as paid and
 * is not. `inTransaction` makes the pair atomic whether or not the caller
 * already opened a transaction.
 */
export async function transitionOpportunity(
  ctx: ServiceContext,
  input: TransitionOpportunityInput,
): Promise<{ id: string; from: OpportunityStatus; to: OpportunityStatus }> {
  const actor = requireTenantContext(ctx.actor);

  // An advocate can only see their own, so another advocate's opportunity is
  // absent rather than forbidden. Business staff see the whole business.
  const opportunity = await ctx.db.opportunity.findFirst({
    where: {
      id: input.opportunityId,
      businessId: actor.businessId,
      ...(actor.kind === "advocate" && { advocateId: actor.advocateId }),
    },
    select: {
      id: true,
      status: true,
      advocateId: true,
      createdByUserId: true,
      // Invariant 4: the policy comes from the Business row, in the same read,
      // and never from the caller's input. There is no parameter for it.
      business: {
        select: {
          requireAdminApprovalForOpportunities: true,
          requireAdminApprovalForRewards: true,
        },
      },
    },
  });
  if (!opportunity) {
    throw new NotFoundError("No such opportunity");
  }

  const from = opportunity.status;

  if (input.influencedRevenueCents != null && input.to !== "VERIFIED") {
    throw new ConflictError(
      "Influenced revenue is recorded when verifying, not on other transitions",
    );
  }

  // Shape first, then authority — so "you cannot do that yet" and "you are not
  // allowed to do that" are different answers.
  if (!isLegalTransition(from, input.to)) {
    throw new ConflictError(`An opportunity cannot go from ${from} to ${input.to}`);
  }

  const allowed = canTransition({
    from,
    to: input.to,
    actor,
    policy: approvalPolicyFromBusiness(opportunity.business),
    isCreator:
      actor.kind === "business" && opportunity.createdByUserId === actor.userId,
    isAssignedAdvocate:
      actor.kind === "advocate" && opportunity.advocateId === actor.advocateId,
  });
  if (!allowed) {
    throw new ForbiddenError(`You may not move this opportunity to ${input.to}`);
  }

  const stamp = STAMPS[input.to];

  // One transaction covers the status change and, where there is one, the
  // credit. For every other transition this is a single statement and the
  // wrapper costs nothing.
  await inTransaction(ctx.db, async (tx) => {
    try {
      await tx.opportunity.update({
        // `status: from` is the compare-and-swap. Prisma throws P2025 when it
        // matches nothing, which is what a second simultaneous attempt gets.
        where: { id: opportunity.id, status: from },
        data: {
          status: input.to,
          ...(stamp && { [stamp]: new Date() }),
          ...(input.to === "VERIFIED" &&
            input.influencedRevenueCents != null && {
              influencedRevenueCents: input.influencedRevenueCents,
            }),
          events: {
            create: {
              fromStatus: from,
              toStatus: input.to,
              actorUserId: actor.userId,
              note: input.note ?? null,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new ConflictError(
          "That opportunity changed while you were acting on it; reload and try again",
        );
      }
      throw error;
    }

    if (input.to === "REWARDED") {
      // After the status change, not before: `creditForOpportunity` refuses an
      // opportunity that is not yet REWARDED, so crediting can never be a way
      // of reaching that status — only a consequence of it.
      await creditForOpportunity({ db: tx, actor }, { opportunityId: opportunity.id });
    }
  });

  return { id: opportunity.id, from, to: input.to };
}
