"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { OpportunityType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, soleBusinessActor } from "@/server/context";
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import {
  BUSINESS_VERBS,
  isBusinessVerb,
  type BusinessVerb,
} from "@/server/services/opportunities/business-verbs";
import { parseDollarsToCents } from "@/lib/money";
import { emailAfterResponse } from "@/server/notify";

export type QuestFormState = { readonly error?: string; readonly ok?: boolean };

const TYPES = [
  "EMAIL_INTRO",
  "REFERENCE_CALL",
  "CASE_STUDY",
  "TESTIMONIAL",
  "PRODUCT_DEMO",
] as const satisfies readonly OpportunityType[];

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .optional();

const createSchema = z.object({
  advocateId: z.uuid(),
  type: z.enum(TYPES),
  title: z.string().trim().min(1).max(200),
  description: optional(2000),
  rewardAmount: z.coerce.number().int().min(0).max(1_000_000),
  prospectName: optional(200),
  prospectCompany: optional(200),
  intent: z.enum(["draft", "send"]),
});

function refresh() {
  revalidatePath("/app/quests");
  revalidatePath("/app");
  revalidatePath("/advocate");
}

/**
 * Draft a quest, and send it straight away if asked.
 *
 * Two steps because they are two things: every quest is created as a draft,
 * and sending is a transition the approval policy governs. If the send is
 * refused — a rep under a strict policy — the draft stands and waits for an
 * admin, which is the policy working, so the message says so rather than
 * reading as a failure.
 */
export async function createQuest(
  _prev: QuestFormState,
  formData: FormData,
): Promise<QuestFormState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error:
        "Choose an advocate and a type, give it a title and a whole-number reward.",
    };
  }
  const { intent, ...input } = parsed.data;

  const identity = await requireIdentity();
  const ctx = { db: prisma, actor: soleBusinessActor(identity) };

  let id: string;
  try {
    id = (await createOpportunity(ctx, input)).id;
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }

  if (intent === "send") {
    try {
      await transitionOpportunity(ctx, { opportunityId: id, to: BUSINESS_VERBS.send });
      emailAfterResponse(ctx, { kind: "QUEST_REQUESTED", opportunityId: id });
    } catch (error) {
      refresh();
      if (error instanceof ServiceError) {
        return { error: `Saved as a draft, not sent: ${error.message}` };
      }
      throw error;
    }
  }

  refresh();
  return { ok: true };
}

const actSchema = z.object({
  opportunityId: z.uuid(),
  verb: z.custom<BusinessVerb>((v) => typeof v === "string" && isBusinessVerb(v)),
  revenue: z.string().optional(),
});

/**
 * Send, verify, award or cancel one quest.
 *
 * The verb maps to a status here, on the server — see `BUSINESS_VERBS`. An
 * influenced-revenue amount is read only for `verify`, typed in dollars and
 * stored as integer cents; the service also refuses it on any other move.
 */
export async function actOnQuest(
  _prev: QuestFormState,
  formData: FormData,
): Promise<QuestFormState> {
  const parsed = actSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    verb: formData.get("verb"),
    revenue: formData.get("revenue") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "That request could not be read. Reload and try again." };
  }
  const { opportunityId, verb, revenue } = parsed.data;

  let influencedRevenueCents: bigint | null = null;
  if (verb === "verify" && revenue !== undefined) {
    try {
      influencedRevenueCents = parseDollarsToCents(revenue);
    } catch {
      return { error: "Enter revenue as dollars and cents, like 12,500 or 12500.00." };
    }
  }

  const identity = await requireIdentity();
  try {
    const ctx = { db: prisma, actor: soleBusinessActor(identity) };
    await transitionOpportunity(ctx, {
      opportunityId,
      to: BUSINESS_VERBS[verb],
      ...(influencedRevenueCents !== null && { influencedRevenueCents }),
    });
    // The advocate hears about the two moves that concern them: being asked,
    // and being paid. Verifying and cancelling are the business's own
    // bookkeeping.
    if (verb === "send")
      emailAfterResponse(ctx, { kind: "QUEST_REQUESTED", opportunityId });
    if (verb === "award")
      emailAfterResponse(ctx, { kind: "QUEST_REWARDED", opportunityId });
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }

  refresh();
  return { ok: true };
}
