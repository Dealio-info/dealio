"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, advocateActor } from "@/server/context";
import { requestRedemption } from "@/server/services/rewards/redemptions";

const schema = z.object({ businessId: z.uuid(), rewardId: z.uuid() });

export type ClaimState = { readonly error?: string; readonly ok?: boolean };

/**
 * Ask for a reward.
 *
 * Note what is *not* here: no cost, and no balance. The form carries only the
 * two ids, and the service reads the price from the catalog and the balance
 * from the ledger. The prototype did the opposite — the browser computed
 * affordability and then wrote the new balance — which is how an advocate
 * could claim anything at any price.
 *
 * `businessId` comes from the form only because `advocateActor` checks it
 * against the identity resolved from the session. One person can advocate for
 * several companies and the currencies do not mix, so the business has to be
 * named; guessing it is the cross-tenant bug.
 */
export async function claimReward(
  _prev: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const parsed = schema.safeParse({
    businessId: formData.get("businessId"),
    rewardId: formData.get("rewardId"),
  });
  if (!parsed.success) {
    return { error: "That reward could not be read. Reload and try again." };
  }

  const identity = await requireIdentity();

  try {
    const actor = advocateActor(identity, parsed.data.businessId);
    await requestRedemption({ db: prisma, actor }, { rewardId: parsed.data.rewardId });
  } catch (error) {
    // "You have 6 and that costs 10" is the most useful thing this can say.
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/advocate/rewards");
  revalidatePath("/app/redemptions");
  return { ok: true };
}
