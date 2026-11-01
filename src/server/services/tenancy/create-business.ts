import { Prisma } from "@/generated/prisma/client";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type PlatformServiceContext,
} from "@/server/context";

export type CreateBusinessInput = {
  readonly name: string;
  /**
   * Unique, and required rather than derived here. `slugify` in
   * `@/lib/slug` turns a name into a candidate, but whether an unusable name
   * is an error or gets a fallback is a boundary decision, not this
   * function's.
   */
  readonly slug: string;
  /**
   * The business's first admin. Required: a business with no admin cannot be
   * administered, and creating one in two steps leaves a window where it
   * exists and nobody can reach it.
   */
  readonly adminUserId: string;
  /**
   * The approval policy, set at onboarding. Both default to requiring admin
   * sign-off — the schema defaults say so too, and this mirrors them rather
   * than relying on them, so the safe default survives a schema edit.
   */
  readonly requireAdminApprovalForOpportunities?: boolean;
  readonly requireAdminApprovalForRewards?: boolean;
};

export type CreatedBusiness = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly requireAdminApprovalForOpportunities: boolean;
  readonly requireAdminApprovalForRewards: boolean;
};

/**
 * Create a business and its first admin, atomically.
 *
 * Dealio staff only. This is the one operation with no tenant context, because
 * it is what brings a tenant into existence — which is exactly why it takes a
 * `PlatformServiceContext` rather than a `ServiceContext`, and why the actor
 * check is also made at runtime below.
 *
 * In the MVP this is reached only from `scripts/seed-business.ts`. There is
 * deliberately no self-serve signup: access comes from being onboarded.
 */
export async function createBusiness(
  ctx: PlatformServiceContext,
  input: CreateBusinessInput,
): Promise<CreatedBusiness> {
  // The type already says platform staff, but types are a review aid, not a
  // guard — a JS caller or a cast gets past them. This is the only thing
  // standing between an onboarding script and tenant creation.
  if (ctx.actor.kind !== "platform_staff") {
    throw new ForbiddenError("Only Dealio staff can create a business");
  }

  const admin = await ctx.db.user.findUnique({
    where: { id: input.adminUserId },
    select: { id: true },
  });
  if (!admin) {
    throw new NotFoundError("No such user to make admin of the new business");
  }

  try {
    // A nested create, not a `$transaction` call: `ctx.db` may already be a
    // transaction client, which has no `$transaction` of its own. Prisma runs
    // the nested write atomically, so the business and its admin membership
    // land together or not at all.
    return await ctx.db.business.create({
      data: {
        name: input.name,
        slug: input.slug,
        ...(input.requireAdminApprovalForOpportunities !== undefined && {
          requireAdminApprovalForOpportunities:
            input.requireAdminApprovalForOpportunities,
        }),
        ...(input.requireAdminApprovalForRewards !== undefined && {
          requireAdminApprovalForRewards: input.requireAdminApprovalForRewards,
        }),
        memberships: {
          create: { userId: input.adminUserId, role: "BUSINESS_ADMIN" },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        requireAdminApprovalForOpportunities: true,
        requireAdminApprovalForRewards: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError(
        `A business with the slug "${input.slug}" already exists`,
      );
    }
    throw error;
  }
}
