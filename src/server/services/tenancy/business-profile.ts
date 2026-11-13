import {
  NotFoundError,
  requireTenantContext,
  type ServiceContext,
} from "@/server/context";

export type BusinessProfile = { readonly id: string; readonly name: string };

/**
 * The caller's own business, as shown in a heading.
 *
 * Takes no business id: the business is the actor's, so there is no input that
 * could point it anywhere else. Readable by staff and advocates alike — an
 * advocate needs to know whose quests and catalog they are looking at.
 */
export async function getBusinessProfile(
  ctx: ServiceContext,
): Promise<BusinessProfile> {
  const actor = requireTenantContext(ctx.actor);
  const business = await ctx.db.business.findUnique({
    where: { id: actor.businessId },
    select: { id: true, name: true },
  });
  if (!business) throw new NotFoundError("Business not found");
  return business;
}
