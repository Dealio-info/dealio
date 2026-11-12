import { Prisma } from "@/generated/prisma/client";
import type { RedemptionStatus } from "@/generated/prisma/enums";
import { inTransaction } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  assertBusinessActor,
  assertBusinessAdmin,
  requireTenantContext,
  type ServiceContext,
} from "@/server/context";
import { getBalance } from "./balance";

export type RedemptionSummary = {
  readonly id: string;
  readonly advocateId: string;
  readonly rewardId: string;
  readonly rewardName: string;
  readonly cost: number;
  readonly status: RedemptionStatus;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly failureReason: string | null;
  /**
   * Who asked. Carried on every summary because the admin queue always needs
   * it and the advocate's own list is the only place it is redundant — one
   * shape beats two nearly identical ones.
   */
  readonly advocate: { readonly name: string | null; readonly email: string };
};

const SELECT = {
  id: true,
  advocateId: true,
  rewardId: true,
  rewardName: true,
  cost: true,
  status: true,
  requestedAt: true,
  decidedAt: true,
  failureReason: true,
  advocate: { select: { name: true, email: true } },
} as const;

/** Still waiting on a decision, so still holding currency aside. */
const PENDING: RedemptionStatus = "REQUESTED";

/**
 * Currency an advocate can still commit: their balance, less whatever is
 * already waiting for a decision.
 *
 * Without this, someone with 10 could request three 10-cost rewards and each
 * would look affordable on its own. Two would then fail at approval, which is
 * work for an admin and a disappointment for the advocate — both avoidable.
 *
 * This is a courtesy, not the guard. The real check happens inside the
 * approval transaction, because only there can it be atomic.
 */
export async function getAvailableBalance(
  ctx: ServiceContext,
  input: { readonly advocateId: string },
): Promise<number> {
  const actor = requireTenantContext(ctx.actor);
  // getBalance does the authority check, including an advocate reading only
  // their own, and refuses an advocate outside the actor's business.
  const balance = await getBalance(ctx, input);
  const { _sum } = await ctx.db.redemption.aggregate({
    where: {
      advocateId: input.advocateId,
      businessId: actor.businessId,
      status: PENDING,
    },
    _sum: { cost: true },
  });
  return balance - (_sum.cost ?? 0);
}

/**
 * An advocate asks for a reward.
 *
 * **Nothing moves yet.** The debit happens on approval, in one transaction
 * with the status change — this only records the ask, with the terms as they
 * stand today so a later catalog edit cannot change them.
 *
 * The affordability check here is server-side, which is the whole difference
 * from the prototype: there it ran in the browser, next to a balance the
 * browser could also write.
 */
export async function requestRedemption(
  ctx: ServiceContext,
  input: { readonly rewardId: string },
): Promise<RedemptionSummary> {
  const actor = requireTenantContext(ctx.actor);
  if (actor.kind !== "advocate") {
    throw new ForbiddenError("Only an advocate can request a reward");
  }

  const reward = await ctx.db.reward.findFirst({
    where: { id: input.rewardId, businessId: actor.businessId, isActive: true },
    select: { id: true, name: true, cost: true },
  });
  if (!reward) {
    throw new NotFoundError("That reward is not available");
  }

  const available = await getAvailableBalance(ctx, { advocateId: actor.advocateId });
  if (available < reward.cost) {
    throw new ConflictError(
      `That costs ${reward.cost} and you have ${available} available`,
    );
  }

  return ctx.db.redemption.create({
    data: {
      businessId: actor.businessId,
      advocateId: actor.advocateId,
      rewardId: reward.id,
      rewardName: reward.name,
      cost: reward.cost,
    },
    select: SELECT,
  });
}

/**
 * An admin approves, and the advocate is debited in the same transaction.
 *
 * The second of exactly two places currency moves (invariant 1), and the one
 * invariant 2 is about: **the balance is re-read here, inside the
 * transaction**, never taken from the request and never trusted from the
 * earlier check at request time. Between those two moments an advocate can
 * have spent elsewhere, or an admin can have approved something else.
 *
 * Three guards. The row lock below is what makes the first two meaningful,
 * and is explained where it is taken:
 *
 *  - the balance re-read under that lock, so an approval cannot overdraw;
 *  - the status compare-and-swap, so the status cannot be set twice;
 *  - the unique index on `(redemptionId, reason)`, so even if both got past
 *    the first two, Postgres would refuse the second debit.
 *
 * Mutation-testing found the compare-and-swap unreachable *while the lock
 * holds*: every approval for one advocate is serialised, so the pre-check
 * below always catches a second attempt first. It is kept anyway — it costs
 * nothing and it is what still protects the status if the lock is ever
 * removed — but no test here proves it load-bearing, and nobody should write
 * one claiming otherwise.
 *
 * **Admin only, whatever the approval policy says.** That policy governs
 * awarding currency; this is the business paying out, and the conservative
 * default is the right one until a customer asks otherwise.
 */
export async function approveRedemption(
  ctx: ServiceContext,
  input: { readonly redemptionId: string },
): Promise<RedemptionSummary> {
  assertBusinessAdmin(ctx.actor);
  const actor = ctx.actor;

  return inTransaction(ctx.db, async (tx) => {
    const redemption = await tx.redemption.findFirst({
      where: { id: input.redemptionId, businessId: actor.businessId },
      select: { id: true, advocateId: true, cost: true, status: true },
    });
    if (!redemption) {
      throw new NotFoundError("No such redemption");
    }
    if (redemption.status !== "REQUESTED") {
      throw new ConflictError(
        `That redemption has already been ${redemption.status.toLowerCase()}`,
      );
    }

    // Serialise every debit for this advocate behind one row lock.
    //
    // Without it the balance re-read below is a write-skew waiting to happen:
    // two admins approving two *different* redemptions for the same advocate
    // touch different rows, so neither the status compare-and-swap nor the
    // unique index notices, and at READ COMMITTED both read the same balance
    // and both insert. A balance of 10 pays out two 10-cost rewards.
    //
    // Locking the advocate row makes the read-then-write window exclusive, so
    // the second approval's re-read sees the first debit and refuses. Credits
    // deliberately take no lock: they only ever raise the balance, so a
    // concurrent credit can make this check conservative but never wrong.
    await tx.$queryRaw`SELECT id FROM advocates WHERE id = ${redemption.advocateId}::uuid FOR UPDATE`;

    // Invariant 2. Not the number checked at request time, not a number from
    // the caller — the derived sum, read now, inside this transaction.
    const balance = await getBalance(
      { db: tx, actor },
      { advocateId: redemption.advocateId },
    );
    if (balance < redemption.cost) {
      throw new ConflictError(
        `This costs ${redemption.cost} and the balance is ${balance}`,
      );
    }

    const { count } = await tx.redemption.updateMany({
      where: { id: redemption.id, status: "REQUESTED" },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedByUserId: actor.userId,
      },
    });
    if (count !== 1) {
      throw new ConflictError("That redemption was decided while you were deciding it");
    }

    try {
      await tx.ledgerEntry.create({
        data: {
          businessId: actor.businessId,
          advocateId: redemption.advocateId,
          redemptionId: redemption.id,
          delta: -redemption.cost,
          reason: "REDEMPTION",
          actorUserId: actor.userId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // The database's own backstop: one debit per redemption, ever.
        throw new ConflictError("That redemption has already been paid");
      }
      throw error;
    }

    return tx.redemption.findFirstOrThrow({
      where: { id: redemption.id },
      select: SELECT,
    });
  });
}

/**
 * Turn one down. Writes nothing to the ledger, because nothing was ever taken.
 */
export async function rejectRedemption(
  ctx: ServiceContext,
  input: { readonly redemptionId: string; readonly reason?: string | null },
): Promise<RedemptionSummary> {
  assertBusinessAdmin(ctx.actor);
  const actor = ctx.actor;

  const { count } = await ctx.db.redemption.updateMany({
    where: {
      id: input.redemptionId,
      businessId: actor.businessId,
      status: "REQUESTED",
    },
    data: {
      status: "REJECTED",
      decidedAt: new Date(),
      decidedByUserId: actor.userId,
      failureReason: input.reason?.trim() || null,
    },
  });
  if (count !== 1) {
    throw new NotFoundError("No redemption is waiting for a decision there");
  }

  return getRedemption(ctx, input.redemptionId);
}

/**
 * Record that the business has sent the reward.
 *
 * A status change and nothing more. Dealio moves no money and holds no float:
 * the company buys and sends the prize itself, so this is bookkeeping about
 * something that happened elsewhere. When Tremendous fulfilment lands, this is
 * where the order id goes.
 */
export async function markRedemptionDelivered(
  ctx: ServiceContext,
  input: { readonly redemptionId: string; readonly externalOrderId?: string | null },
): Promise<RedemptionSummary> {
  assertBusinessAdmin(ctx.actor);
  const actor = ctx.actor;

  const { count } = await ctx.db.redemption.updateMany({
    where: {
      id: input.redemptionId,
      businessId: actor.businessId,
      status: "APPROVED",
    },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      ...(input.externalOrderId ? { externalOrderId: input.externalOrderId } : {}),
    },
  });
  if (count !== 1) {
    throw new ConflictError("Only an approved redemption can be marked delivered");
  }

  return getRedemption(ctx, input.redemptionId);
}

/** Redemptions the caller may see: the business's, or the advocate's own. */
export async function listRedemptions(
  ctx: ServiceContext,
  input: { readonly status?: RedemptionStatus } = {},
): Promise<RedemptionSummary[]> {
  const actor = requireTenantContext(ctx.actor);

  return ctx.db.redemption.findMany({
    where: {
      businessId: actor.businessId,
      ...(actor.kind === "advocate" && { advocateId: actor.advocateId }),
      ...(input.status && { status: input.status }),
    },
    select: SELECT,
    orderBy: [{ requestedAt: "desc" }],
  });
}

export async function getRedemption(
  ctx: ServiceContext,
  redemptionId: string,
): Promise<RedemptionSummary> {
  const actor = requireTenantContext(ctx.actor);

  const redemption = await ctx.db.redemption.findFirst({
    where: {
      id: redemptionId,
      businessId: actor.businessId,
      ...(actor.kind === "advocate" && { advocateId: actor.advocateId }),
    },
    select: SELECT,
  });
  if (!redemption) {
    throw new NotFoundError("No such redemption");
  }
  return redemption;
}

/** How many are waiting on an admin. For the dashboard's attention list. */
export async function countPendingRedemptions(ctx: ServiceContext): Promise<number> {
  assertBusinessActor(ctx.actor);
  return ctx.db.redemption.count({
    where: { businessId: ctx.actor.businessId, status: PENDING },
  });
}
