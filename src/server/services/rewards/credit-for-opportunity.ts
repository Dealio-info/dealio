import { Prisma } from "@/generated/prisma/client";
import {
  ConflictError,
  NotFoundError,
  assertBusinessActor,
  type ServiceContext,
} from "@/server/context";

export type CreditForOpportunityResult = {
  readonly advocateId: string;
  /** What was credited. Zero when the opportunity carried no reward. */
  readonly delta: number;
  /** True when a credit for this opportunity already existed. */
  readonly alreadyCredited: boolean;
};

/**
 * Credit an advocate for an opportunity that has reached `REWARDED`.
 *
 * One of exactly two places currency moves (invariant 1); the other is the
 * debit when a redemption is approved. Called from inside the
 * `VERIFIED → REWARDED` transition, in the same transaction, so the status and
 * the money cannot disagree.
 *
 * **Idempotent, and not by being careful.** The unique index on
 * `(opportunityId, reason)` means a second credit for the same opportunity is
 * rejected by Postgres. That is deliberate: the prototype lost money to
 * arithmetic the application was trusted to get right, so the guarantee lives
 * where a retry, a double-click or a second server cannot route around it. The
 * P2002 below is the normal path for a repeat, not an exceptional one.
 *
 * Writes only. There is no update or delete against `LedgerEntry` anywhere in
 * the codebase, and a database trigger rejects both regardless — corrections
 * are appended as `MANUAL_ADJUSTMENT` or `FULFILLMENT_FAILED`.
 */
export async function creditForOpportunity(
  ctx: ServiceContext,
  input: { readonly opportunityId: string },
): Promise<CreditForOpportunityResult> {
  assertBusinessActor(ctx.actor);

  const opportunity = await ctx.db.opportunity.findFirst({
    where: { id: input.opportunityId, businessId: ctx.actor.businessId },
    select: { id: true, advocateId: true, status: true, rewardAmount: true },
  });
  if (!opportunity) {
    throw new NotFoundError("No such opportunity");
  }
  if (opportunity.status !== "REWARDED") {
    // Crediting is a consequence of reaching REWARDED, never a way to get
    // there. Allowing it earlier would put a second route to currency beside
    // the state machine.
    throw new ConflictError(
      `An opportunity must be REWARDED before it can be credited; this one is ${opportunity.status}`,
    );
  }

  // A zero-reward opportunity credits nothing, and must not try: the ledger
  // forbids a zero delta, so writing one would fail the CHECK constraint.
  // Recording "nothing happened" as a row would also make every balance query
  // carry meaningless entries.
  if (opportunity.rewardAmount === 0) {
    return { advocateId: opportunity.advocateId, delta: 0, alreadyCredited: false };
  }

  try {
    await ctx.db.ledgerEntry.create({
      data: {
        businessId: ctx.actor.businessId,
        advocateId: opportunity.advocateId,
        opportunityId: opportunity.id,
        delta: opportunity.rewardAmount,
        reason: "OPPORTUNITY_REWARD",
        actorUserId: ctx.actor.userId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        advocateId: opportunity.advocateId,
        delta: 0,
        alreadyCredited: true,
      };
    }
    throw error;
  }

  return {
    advocateId: opportunity.advocateId,
    delta: opportunity.rewardAmount,
    alreadyCredited: false,
  };
}
