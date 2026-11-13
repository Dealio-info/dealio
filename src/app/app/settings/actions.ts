"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, soleBusinessActor } from "@/server/context";
import { updateApprovalPolicy } from "@/server/services/tenancy/approval-policy";

export type PolicyState = { readonly error?: string; readonly ok?: boolean };

const flag = z.enum(["true", "false"]).transform((v) => v === "true");
const schema = z.object({
  requireAdminApprovalForOpportunities: flag,
  requireAdminApprovalForRewards: flag,
});

/**
 * Save the approval policy.
 *
 * The role check is not here — `updateApprovalPolicy` refuses anyone but an
 * admin, and that refusal is what this returns to a rep who submits the form
 * by hand. Checking in two places would only invite them to disagree.
 */
export async function saveApprovalPolicy(
  _prev: PolicyState,
  formData: FormData,
): Promise<PolicyState> {
  const parsed = schema.safeParse({
    requireAdminApprovalForOpportunities: formData.get(
      "requireAdminApprovalForOpportunities",
    ),
    requireAdminApprovalForRewards: formData.get("requireAdminApprovalForRewards"),
  });
  if (!parsed.success) {
    return { error: "That form could not be read. Reload and try again." };
  }

  const identity = await requireIdentity();
  try {
    await updateApprovalPolicy(
      { db: prisma, actor: soleBusinessActor(identity) },
      parsed.data,
    );
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }

  revalidatePath("/app/settings");
  return { ok: true };
}
