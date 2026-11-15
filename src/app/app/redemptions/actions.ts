"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, soleBusinessActor } from "@/server/context";
import {
  approveRedemption,
  markRedemptionDelivered,
  rejectRedemption,
} from "@/server/services/rewards/redemptions";
import { emailAfterResponse } from "@/server/notify";

export type DecisionState = { readonly error?: string; readonly ok?: boolean };

/**
 * What an admin can do to a request, and nothing else.
 *
 * Same reasoning as the advocate side: a closed set of verbs rather than a
 * target status from the form. The browser cannot name `DELIVERED` on a
 * redemption that was never approved, nor reach `FAILED`, which only
 * fulfilment can write.
 */
const schema = z.object({
  redemptionId: z.uuid(),
  decision: z.enum(["approve", "reject", "delivered"]),
  reason: z.string().trim().max(500).optional(),
  externalOrderId: z.string().trim().max(200).optional(),
});

export async function decideRedemption(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = schema.safeParse({
    redemptionId: formData.get("redemptionId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
    externalOrderId: formData.get("externalOrderId") || undefined,
  });
  if (!parsed.success) {
    return { error: "That request could not be read. Reload and try again." };
  }
  const { redemptionId, decision, reason, externalOrderId } = parsed.data;

  const identity = await requireIdentity();

  try {
    const actor = soleBusinessActor(identity);
    const ctx = { db: prisma, actor };
    if (decision === "approve") {
      await approveRedemption(ctx, { redemptionId });
      emailAfterResponse(ctx, { kind: "REDEMPTION_APPROVED", redemptionId });
    } else if (decision === "reject") {
      await rejectRedemption(ctx, { redemptionId, reason: reason ?? null });
      emailAfterResponse(ctx, { kind: "REDEMPTION_REJECTED", redemptionId });
    } else {
      await markRedemptionDelivered(ctx, {
        redemptionId,
        externalOrderId: externalOrderId ?? null,
      });
      emailAfterResponse(ctx, { kind: "REDEMPTION_DELIVERED", redemptionId });
    }
  } catch (error) {
    // "Someone already decided this" and "the balance no longer covers it" are
    // both things to read and act on, not crashes.
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/app/redemptions");
  revalidatePath("/app");
  revalidatePath("/advocate/rewards");
  return { ok: true };
}
