import { AdvocateStatus, OpportunityStatus } from "@/generated/prisma/enums";
import type {
  AdvocateStatus as AdvocateStatusT,
  LedgerReason,
  OpportunityStatus as OpportunityStatusT,
} from "@/generated/prisma/enums";
import { assertBusinessActor, type ServiceContext } from "@/server/context";

/**
 * Read-only aggregates for the business dashboard.
 *
 * The plan's rule for this module is "never ad-hoc queries from components":
 * every number a business sees about itself comes from here, scoped by
 * `actor.businessId`, so there is one place to check that a total means what
 * its label says and one place a cross-tenant leak could hide.
 *
 * Nothing here writes. Nothing here caches. Every figure is computed from the
 * ledger and the lifecycle tables on each read, which at MVP scale is cheap and
 * means a dashboard can never disagree with the records under it.
 */

export type DashboardSummary = {
  /** Count of quests in each status. Every status is present, zero-filled. */
  readonly pipeline: Readonly<Record<OpportunityStatusT, number>>;
  /** Things waiting on someone at the business. */
  readonly attention: {
    /** Drafted, not yet approved to send. */
    readonly awaitingApproval: number;
    /** Marked done by the advocate, not yet verified. */
    readonly awaitingVerification: number;
    /** Redemptions asked for, not yet decided. */
    readonly redemptionsWaiting: number;
  };
  /**
   * Revenue the business attributed to advocacy, in integer cents. Only
   * quests that are VERIFIED or REWARDED count: an amount is recorded at
   * verification, and a verified quest that was later cancelled did not stand.
   */
  readonly influencedRevenueCents: bigint;
  /**
   * Reward economics, all sums over the ledger. They reconcile by
   * construction: `awarded − redeemed + adjusted = outstanding`.
   */
  readonly currency: {
    /** Credited for completed quests. */
    readonly awarded: number;
    /** Spent on approved redemptions, net of any refunded on failed fulfilment. */
    readonly redeemed: number;
    /** Manual corrections and expiry. Signed: usually zero or negative. */
    readonly adjusted: number;
    /** Earned and not yet spent — what the business still owes in rewards. */
    readonly outstanding: number;
  };
  readonly advocates: {
    readonly active: number;
    readonly invited: number;
    readonly inactive: number;
  };
};

/** Which ledger reasons land in which bucket. Exhaustive, so a new reason fails to compile. */
const BUCKET: Record<LedgerReason, "awarded" | "redeemed" | "adjusted"> = {
  OPPORTUNITY_REWARD: "awarded",
  REDEMPTION: "redeemed",
  // A compensating credit after a failed external order: it undoes part of a
  // redemption, so it nets against `redeemed` rather than counting as new
  // currency awarded.
  FULFILLMENT_FAILED: "redeemed",
  MANUAL_ADJUSTMENT: "adjusted",
  EXPIRY: "adjusted",
};

/** Statuses whose recorded influenced revenue stands. */
const REVENUE_STANDS: OpportunityStatusT[] = ["VERIFIED", "REWARDED"];

export async function getDashboardSummary(
  ctx: ServiceContext,
): Promise<DashboardSummary> {
  assertBusinessActor(ctx.actor);
  const businessId = ctx.actor.businessId;

  const [byStatus, revenue, byReason, redemptionsWaiting, byAdvocateStatus] =
    await Promise.all([
      ctx.db.opportunity.groupBy({
        by: ["status"],
        where: { businessId },
        _count: { _all: true },
      }),
      ctx.db.opportunity.aggregate({
        where: { businessId, status: { in: REVENUE_STANDS } },
        _sum: { influencedRevenueCents: true },
      }),
      ctx.db.ledgerEntry.groupBy({
        by: ["reason"],
        where: { businessId },
        _sum: { delta: true },
      }),
      ctx.db.redemption.count({ where: { businessId, status: "REQUESTED" } }),
      ctx.db.advocate.groupBy({
        by: ["status"],
        where: { businessId },
        _count: { _all: true },
      }),
    ]);

  const pipeline = Object.fromEntries(
    Object.values(OpportunityStatus).map((s) => [s, 0]),
  ) as Record<OpportunityStatusT, number>;
  for (const row of byStatus) pipeline[row.status] = row._count._all;

  const sums = { awarded: 0, redeemed: 0, adjusted: 0 };
  for (const row of byReason) sums[BUCKET[row.reason]] += row._sum.delta ?? 0;
  // Redemptions are stored as negative deltas; the dashboard reports them as
  // an amount spent.
  const currency = {
    awarded: sums.awarded,
    // `0 - x`, not `-x`: negating an empty sum gives -0, which equals 0 but
    // can print as "-0".
    redeemed: 0 - sums.redeemed,
    adjusted: sums.adjusted,
    outstanding: sums.awarded + sums.redeemed + sums.adjusted,
  };

  const advocateCounts = Object.fromEntries(
    Object.values(AdvocateStatus).map((s) => [s, 0]),
  ) as Record<AdvocateStatusT, number>;
  for (const row of byAdvocateStatus) advocateCounts[row.status] = row._count._all;

  return {
    pipeline,
    attention: {
      awaitingApproval: pipeline.PENDING_APPROVAL,
      awaitingVerification: pipeline.COMPLETED,
      redemptionsWaiting,
    },
    influencedRevenueCents: revenue._sum.influencedRevenueCents ?? 0n,
    currency,
    advocates: {
      active: advocateCounts.ACTIVE,
      invited: advocateCounts.INVITED,
      inactive: advocateCounts.INACTIVE,
    },
  };
}

export type AdvocateBalance = {
  readonly advocateId: string;
  readonly name: string | null;
  readonly email: string;
  readonly status: AdvocateStatusT;
  readonly balance: number;
};

/**
 * Every advocate at the business with their balance, largest first.
 *
 * One grouped sum over the ledger rather than `getBalance` per advocate, but
 * the same definition — `SUM(delta)` per advocate — and the integration test
 * checks each row against `getBalance` so the two cannot quietly diverge.
 */
export async function listAdvocateBalances(
  ctx: ServiceContext,
): Promise<AdvocateBalance[]> {
  assertBusinessActor(ctx.actor);
  const businessId = ctx.actor.businessId;

  const [advocates, sums] = await Promise.all([
    ctx.db.advocate.findMany({
      where: { businessId },
      select: { id: true, name: true, email: true, status: true },
    }),
    ctx.db.ledgerEntry.groupBy({
      by: ["advocateId"],
      // Not load-bearing for correctness, and mutation testing says so: the
      // result is only ever looked up by this business's own advocate ids, so
      // another tenant's sums could never surface. Kept so the query reads
      // only what it needs, and so it stays safe if the lookup ever changes.
      where: { businessId },
      _sum: { delta: true },
    }),
  ]);

  const balanceOf = new Map(sums.map((row) => [row.advocateId, row._sum.delta ?? 0]));

  return advocates
    .map((a) => ({
      advocateId: a.id,
      name: a.name,
      email: a.email,
      status: a.status,
      balance: balanceOf.get(a.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.balance - a.balance || (a.name ?? a.email).localeCompare(b.name ?? b.email),
    );
}
