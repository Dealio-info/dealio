"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, advocateActor } from "@/server/context";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";

/**
 * What an advocate can do to a request, and the status each means.
 *
 * A closed set rather than a status passed through from the form: the browser
 * naming its own target status would let an advocate try `REWARDED`. The state
 * machine would refuse it, but the narrower surface means there is nothing to
 * refuse.
 */
const RESPONSES = {
  accept: "ACCEPTED",
  decline: "DECLINED",
  complete: "COMPLETED",
} as const;

const schema = z.object({
  businessId: z.uuid(),
  opportunityId: z.uuid(),
  response: z.enum(["accept", "decline", "complete"]),
});

export type RespondState = { readonly error?: string };

/**
 * Respond to a request as the advocate it was sent to.
 *
 * `businessId` comes from the form, which is safe precisely because it is not
 * trusted: `advocateActor` looks it up in the identity resolved from the
 * session and throws unless this person really is an advocate there. Naming
 * the business explicitly is the documented way to pick a context — one person
 * can advocate for several companies, and guessing which is the cross-tenant
 * bug the design exists to prevent.
 *
 * Everything after that is the same state machine the business side uses. There
 * is no advocate-specific transition path, so there is no second set of rules
 * to keep in step.
 */
export async function respondToQuest(
  _prev: RespondState,
  formData: FormData,
): Promise<RespondState> {
  const parsed = schema.safeParse({
    businessId: formData.get("businessId"),
    opportunityId: formData.get("opportunityId"),
    response: formData.get("response"),
  });
  if (!parsed.success) {
    return { error: "That request could not be read. Reload and try again." };
  }

  const identity = await requireIdentity();

  try {
    const actor = advocateActor(identity, parsed.data.businessId);
    await transitionOpportunity(
      { db: prisma, actor },
      {
        opportunityId: parsed.data.opportunityId,
        to: RESPONSES[parsed.data.response],
      },
    );
  } catch (error) {
    // Service errors are things the person can act on — not permitted, already
    // moved, no longer there. Anything else is a bug and should surface as one.
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/advocate");
  return {};
}
