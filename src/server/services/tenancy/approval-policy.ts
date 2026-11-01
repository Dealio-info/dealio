import {
  NotFoundError,
  approvalPolicyFromBusiness,
  assertBusinessActor,
  assertBusinessAdmin,
  type ApprovalPolicy,
  type ServiceContext,
} from "@/server/context";

export type UpdateApprovalPolicyInput = {
  readonly requireAdminApprovalForOpportunities?: boolean;
  readonly requireAdminApprovalForRewards?: boolean;
};

/**
 * Read the caller's business's approval policy.
 *
 * Any staff member may read it, including a rep: the UI needs to explain
 * whether a rep's action will go straight through or wait for sign-off, and
 * hiding that only produces confusing buttons. Reading it is not how authority
 * is decided — `canPublishOpportunity` and `canRewardOpportunity` do that, from
 * a policy read inside the transaction (invariant 4).
 */
export async function getApprovalPolicy(ctx: ServiceContext): Promise<ApprovalPolicy> {
  assertBusinessActor(ctx.actor);
  return approvalPolicyFromBusiness(await loadBusiness(ctx));
}

/**
 * Change it. Admins only — a rep who could delegate authority to reps would be
 * granting themselves the authority, which is invariant 4's whole point.
 *
 * Takes effect **forward only.** It writes nothing to `OpportunityEvent` or
 * `LedgerEntry`, so an opportunity already approved stays approved and a credit
 * already made stays made. Anything else would be rewriting history to match a
 * setting, and the ledger is append-only for exactly that reason.
 */
export async function updateApprovalPolicy(
  ctx: ServiceContext,
  input: UpdateApprovalPolicyInput,
): Promise<ApprovalPolicy> {
  assertBusinessAdmin(ctx.actor);

  // An empty patch is a no-op rather than an error: a settings form that
  // submits unchanged values should not fail.
  const business = await ctx.db.business.update({
    where: { id: ctx.actor.businessId },
    data: {
      ...(input.requireAdminApprovalForOpportunities !== undefined && {
        requireAdminApprovalForOpportunities:
          input.requireAdminApprovalForOpportunities,
      }),
      ...(input.requireAdminApprovalForRewards !== undefined && {
        requireAdminApprovalForRewards: input.requireAdminApprovalForRewards,
      }),
    },
    select: {
      requireAdminApprovalForOpportunities: true,
      requireAdminApprovalForRewards: true,
    },
  });

  return approvalPolicyFromBusiness(business);
}

async function loadBusiness(ctx: ServiceContext) {
  const business = await ctx.db.business.findUnique({
    where: { id: ctx.actor.businessId },
    select: {
      requireAdminApprovalForOpportunities: true,
      requireAdminApprovalForRewards: true,
    },
  });
  if (!business) {
    throw new NotFoundError("Business not found");
  }
  return business;
}
