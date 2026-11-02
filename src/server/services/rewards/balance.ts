import type { LedgerReason } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  NotFoundError,
  requireTenantContext,
  type ServiceContext,
} from "@/server/context";

/**
 * An advocate's balance is `SUM(delta)` over their ledger entries. There is no
 * stored balance column anywhere, and there never will be.
 *
 * That is the whole answer to the prototype's worst defect: a mutable
 * `coins_earned` the browser could write, which could not be reconciled
 * against anything. A sum cannot drift from its own history, and outstanding
 * reward liability — a metric the product brief asks for and the prototype
 * could not compute at all — is the same sum taken across a business.
 *
 * If this ever needs caching, the cache goes behind this function. Callers
 * must not learn that a stored number exists.
 */
export async function getBalance(
  ctx: ServiceContext,
  input: { readonly advocateId: string },
): Promise<number> {
  const actor = requireTenantContext(ctx.actor);

  // An advocate may read only their own balance; staff may read any in their
  // own business. Checked before the aggregate so a probe cannot distinguish
  // "no such advocate" from "zero balance".
  if (actor.kind === "advocate" && actor.advocateId !== input.advocateId) {
    throw new ForbiddenError("You may only read your own balance");
  }

  const advocate = await ctx.db.advocate.findFirst({
    where: { id: input.advocateId, businessId: actor.businessId },
    select: { id: true },
  });
  if (!advocate) {
    throw new NotFoundError("No such advocate");
  }

  const { _sum } = await ctx.db.ledgerEntry.aggregate({
    where: { advocateId: input.advocateId, businessId: actor.businessId },
    _sum: { delta: true },
  });

  // No entries sums to null, which is zero in every sense the caller cares
  // about.
  return _sum.delta ?? 0;
}

export type LedgerLine = {
  readonly id: string;
  readonly delta: number;
  readonly reason: LedgerReason;
  readonly opportunityId: string | null;
  readonly redemptionId: string | null;
  readonly note: string | null;
  readonly createdAt: Date;
};

/**
 * The entries behind a balance, newest first — the audit trail that makes the
 * number explainable rather than merely correct.
 */
export async function listLedgerEntries(
  ctx: ServiceContext,
  input: { readonly advocateId: string },
): Promise<LedgerLine[]> {
  const actor = requireTenantContext(ctx.actor);

  if (actor.kind === "advocate" && actor.advocateId !== input.advocateId) {
    throw new ForbiddenError("You may only read your own ledger");
  }

  return ctx.db.ledgerEntry.findMany({
    where: { advocateId: input.advocateId, businessId: actor.businessId },
    select: {
      id: true,
      delta: true,
      reason: true,
      opportunityId: true,
      redemptionId: true,
      note: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

/**
 * Total currency a business has awarded and not yet seen redeemed — its
 * outstanding liability. Staff only.
 */
export async function getOutstandingLiability(ctx: ServiceContext): Promise<number> {
  const actor = requireTenantContext(ctx.actor);
  if (actor.kind !== "business") {
    throw new ForbiddenError("This action requires a business team member");
  }

  const { _sum } = await ctx.db.ledgerEntry.aggregate({
    where: { businessId: actor.businessId },
    _sum: { delta: true },
  });
  return _sum.delta ?? 0;
}
