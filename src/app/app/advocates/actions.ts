"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, soleBusinessActor } from "@/server/context";
import { serverEnv } from "@/lib/env";
import { inviteAdvocate } from "@/server/services/advocates/invite-advocate";

export type InviteState = {
  readonly error?: string;
  readonly invitation?: {
    readonly email: string;
    readonly link: string;
    readonly expiresAt: string;
    readonly reinvited: boolean;
  };
};

const optional = z
  .string()
  .trim()
  .max(200)
  .transform((v) => v || null)
  .optional();

const schema = z.object({
  email: z.email().max(320),
  name: optional,
  company: optional,
  title: optional,
});

/**
 * Invite an advocate and hand back the link.
 *
 * The link carries the plaintext token, which exists only in this response —
 * the database keeps a hash. So it is returned to the person who asked for it
 * and nowhere else; if they lose it, inviting the same address again expires
 * the old link and makes a new one. Email delivery is Task 14; until then the
 * admin sends it themselves.
 */
export async function invite(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") ?? undefined,
    company: formData.get("company") ?? undefined,
    title: formData.get("title") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const identity = await requireIdentity();
  try {
    const result = await inviteAdvocate(
      { db: prisma, actor: soleBusinessActor(identity) },
      parsed.data,
    );
    revalidatePath("/app/advocates");
    revalidatePath("/app");
    return {
      invitation: {
        email: result.email,
        link: `${serverEnv.appUrl}/invite/${result.token}`,
        expiresAt: result.expiresAt.toISOString(),
        reinvited: result.reinvited,
      },
    };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }
}
