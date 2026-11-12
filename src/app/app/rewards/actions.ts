"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, soleBusinessActor } from "@/server/context";
import {
  createReward,
  setRewardActive,
  updateReward,
} from "@/server/services/rewards/catalog";

export type CatalogState = { readonly error?: string; readonly ok?: boolean };

/**
 * Cost arrives from a number input, so it is a string. Coerce explicitly and
 * insist on a whole number here rather than letting a float reach a column
 * that cannot hold one — currency amounts are integers throughout.
 */
const cost = z.coerce.number().int().min(0).max(1_000_000);
const name = z.string().trim().min(1).max(200);
const description = z.string().trim().max(2000).optional();

const createSchema = z.object({ name, description, cost });
const updateSchema = z.object({ rewardId: z.uuid(), name, description, cost });
const activeSchema = z.object({
  rewardId: z.uuid(),
  isActive: z.enum(["true", "false"]),
});

/** Shared shape: resolve the actor, run the service, turn errors into text. */
async function run(
  fn: (actor: ReturnType<typeof soleBusinessActor>) => Promise<unknown>,
) {
  const identity = await requireIdentity();
  try {
    await fn(soleBusinessActor(identity));
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }
  revalidatePath("/app/rewards");
  revalidatePath("/advocate/rewards");
  return { ok: true };
}

export async function addReward(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    cost: formData.get("cost"),
  });
  if (!parsed.success) {
    return { error: "Give the reward a name and a whole-number cost." };
  }
  return run((actor) => createReward({ db: prisma, actor }, parsed.data));
}

export async function editReward(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const parsed = updateSchema.safeParse({
    rewardId: formData.get("rewardId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    cost: formData.get("cost"),
  });
  if (!parsed.success) {
    return { error: "Give the reward a name and a whole-number cost." };
  }
  const { rewardId, ...rest } = parsed.data;
  return run((actor) =>
    updateReward(
      { db: prisma, actor },
      { rewardId, ...rest, description: rest.description ?? null },
    ),
  );
}

export async function toggleReward(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const parsed = activeSchema.safeParse({
    rewardId: formData.get("rewardId"),
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) {
    return { error: "That reward could not be read. Reload and try again." };
  }
  return run((actor) =>
    setRewardActive(
      { db: prisma, actor },
      { rewardId: parsed.data.rewardId, isActive: parsed.data.isActive === "true" },
    ),
  );
}
