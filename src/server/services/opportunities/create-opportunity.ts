import type { OpportunityType } from "@/generated/prisma/enums";
import {
  ConflictError,
  NotFoundError,
  assertBusinessActor,
  type ServiceContext,
} from "@/server/context";

export type CreateOpportunityInput = {
  readonly advocateId: string;
  readonly type: OpportunityType;
  readonly title: string;
  readonly description?: string | null;
  /** Currency units, integer. What the advocate earns on `REWARDED`. */
  readonly rewardAmount: number;
  readonly prospectName?: string | null;
  readonly prospectCompany?: string | null;
  readonly prospectEmail?: string | null;
};

/**
 * Draft an opportunity. It starts at `PENDING_APPROVAL` and goes no further
 * here.
 *
 * Creating and publishing are separate steps even for a rep who is allowed to
 * publish, because the approval policy can change between them and the
 * transition is where it gets read. Folding them together would mean deciding
 * authority at draft time and acting on it later, which is exactly the shape
 * invariant 4 exists to prevent.
 *
 * The opening `OpportunityEvent` is written here, with a null `fromStatus`, so
 * the audit trail starts at creation rather than at the first transition.
 */
export async function createOpportunity(
  ctx: ServiceContext,
  input: CreateOpportunityInput,
): Promise<{ id: string; status: "PENDING_APPROVAL" }> {
  assertBusinessActor(ctx.actor);
  const businessId = ctx.actor.businessId;

  // Scoped by businessId, so another business's advocate reads as absent
  // rather than forbidden — saying "forbidden" would confirm it exists.
  const advocate = await ctx.db.advocate.findFirst({
    where: { id: input.advocateId, businessId },
    select: { id: true, status: true },
  });
  if (!advocate) {
    throw new NotFoundError("No such advocate");
  }
  if (advocate.status === "INACTIVE") {
    throw new ConflictError("That advocate has been deactivated");
  }

  const created = await ctx.db.opportunity.create({
    data: {
      businessId,
      createdByUserId: ctx.actor.userId,
      advocateId: advocate.id,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      rewardAmount: input.rewardAmount,
      prospectName: input.prospectName ?? null,
      prospectCompany: input.prospectCompany ?? null,
      prospectEmail: input.prospectEmail ?? null,
      events: {
        create: { toStatus: "PENDING_APPROVAL", actorUserId: ctx.actor.userId },
      },
    },
    select: { id: true, status: true },
  });

  return { id: created.id, status: "PENDING_APPROVAL" };
}
