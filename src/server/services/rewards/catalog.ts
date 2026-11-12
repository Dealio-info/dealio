import {
  ConflictError,
  NotFoundError,
  assertBusinessActor,
  assertBusinessAdmin,
  requireTenantContext,
  type ServiceContext,
} from "@/server/context";

export type RewardSummary = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /** Currency units, integer. */
  readonly cost: number;
  readonly isActive: boolean;
  readonly tremendousProductId: string | null;
  readonly createdAt: Date;
};

export type CreateRewardInput = {
  readonly name: string;
  readonly description?: string | null;
  readonly cost: number;
  readonly tremendousProductId?: string | null;
};

/**
 * The reward catalog, one per business.
 *
 * Scoped by `businessId` throughout — there is no shared global catalog, which
 * follows from the company funding and fulfilling its own prizes. Admins
 * manage it; reps read it; advocates see only what is currently on offer.
 *
 * **Nothing here deletes a reward.** A redemption points at the reward it was
 * made against, and the database refuses to drop a referenced row, so a delete
 * would only ever work for rewards nobody wanted. `setRewardActive(false)`
 * takes it off the catalog and leaves history resolvable. There is deliberately
 * no uniqueness constraint on the name either: deactivating "Coffee voucher"
 * and later adding a new one is normal, and a unique index would block it.
 */
export async function createReward(
  ctx: ServiceContext,
  input: CreateRewardInput,
): Promise<RewardSummary> {
  assertBusinessAdmin(ctx.actor);

  const name = input.name.trim();
  if (name === "") {
    throw new ConflictError("A reward needs a name");
  }
  if (!Number.isInteger(input.cost) || input.cost < 0) {
    throw new ConflictError("A reward's cost must be a whole number, and not negative");
  }

  return ctx.db.reward.create({
    data: {
      businessId: ctx.actor.businessId,
      name,
      description: input.description?.trim() || null,
      cost: input.cost,
      tremendousProductId: input.tremendousProductId ?? null,
    },
    select: SELECT,
  });
}

export type UpdateRewardInput = {
  readonly rewardId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly cost?: number;
  readonly tremendousProductId?: string | null;
};

/**
 * Edit a reward in place.
 *
 * Safe to re-price because a `Redemption` snapshots both `cost` and
 * `rewardName` when it is requested, so changing the catalog cannot rewrite
 * what someone already agreed to.
 */
export async function updateReward(
  ctx: ServiceContext,
  input: UpdateRewardInput,
): Promise<RewardSummary> {
  assertBusinessAdmin(ctx.actor);

  if (input.name !== undefined && input.name.trim() === "") {
    throw new ConflictError("A reward needs a name");
  }
  if (input.cost !== undefined && (!Number.isInteger(input.cost) || input.cost < 0)) {
    throw new ConflictError("A reward's cost must be a whole number, and not negative");
  }

  // `updateMany` rather than `update`, because the where clause carries the
  // businessId: another business's reward matches nothing instead of being
  // found and then rejected.
  const { count } = await ctx.db.reward.updateMany({
    where: { id: input.rewardId, businessId: ctx.actor.businessId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && {
        description: input.description?.trim() || null,
      }),
      ...(input.cost !== undefined && { cost: input.cost }),
      ...(input.tremendousProductId !== undefined && {
        tremendousProductId: input.tremendousProductId,
      }),
    },
  });
  if (count !== 1) {
    throw new NotFoundError("No such reward");
  }

  return getReward(ctx, input.rewardId);
}

/**
 * Take a reward off the catalog, or put it back.
 *
 * The replacement for deleting. Past redemptions keep resolving, the reward
 * stops being offered, and a business that changes its mind loses nothing.
 */
export async function setRewardActive(
  ctx: ServiceContext,
  input: { readonly rewardId: string; readonly isActive: boolean },
): Promise<RewardSummary> {
  assertBusinessAdmin(ctx.actor);

  const { count } = await ctx.db.reward.updateMany({
    where: { id: input.rewardId, businessId: ctx.actor.businessId },
    data: { isActive: input.isActive },
  });
  if (count !== 1) {
    throw new NotFoundError("No such reward");
  }

  return getReward(ctx, input.rewardId);
}

/**
 * The catalog.
 *
 * An advocate always gets the active rewards and nothing else, whatever they
 * ask for — a withdrawn reward is not theirs to see, and the flag is the
 * business's own view of its catalog. Staff may ask for everything.
 */
export async function listRewards(
  ctx: ServiceContext,
  input: { readonly includeInactive?: boolean } = {},
): Promise<RewardSummary[]> {
  const actor = requireTenantContext(ctx.actor);
  const includeInactive = actor.kind === "business" && input.includeInactive === true;

  return ctx.db.reward.findMany({
    where: {
      businessId: actor.businessId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    select: SELECT,
    orderBy: [{ cost: "asc" }, { name: "asc" }],
  });
}

/** One reward, scoped the same way. Advocates cannot fetch an inactive one. */
export async function getReward(
  ctx: ServiceContext,
  rewardId: string,
): Promise<RewardSummary> {
  const actor = requireTenantContext(ctx.actor);

  const reward = await ctx.db.reward.findFirst({
    where: {
      id: rewardId,
      businessId: actor.businessId,
      ...(actor.kind === "advocate" && { isActive: true }),
    },
    select: SELECT,
  });
  if (!reward) {
    throw new NotFoundError("No such reward");
  }
  return reward;
}

/** Staff-only count, for the catalog page's header. */
export async function countActiveRewards(ctx: ServiceContext): Promise<number> {
  assertBusinessActor(ctx.actor);
  return ctx.db.reward.count({
    where: { businessId: ctx.actor.businessId, isActive: true },
  });
}

const SELECT = {
  id: true,
  name: true,
  description: true,
  cost: true,
  isActive: true,
  tremendousProductId: true,
  createdAt: true,
} as const;
