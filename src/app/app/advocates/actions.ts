"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError, soleBusinessActor } from "@/server/context";
import { serverEnv } from "@/lib/env";
import { inviteAdvocate } from "@/server/services/advocates/invite-advocate";
import { sendEmail } from "@/server/services/email/send";

export type InviteState = {
  readonly error?: string;
  readonly invitation?: {
    readonly email: string;
    readonly link: string;
    readonly expiresAt: string;
    readonly reinvited: boolean;
    /** Whether the link also went out by email, so the admin knows whether to send it. */
    readonly emailed: "sent" | "skipped" | "failed";
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
  let ctx;
  let result;
  try {
    ctx = { db: prisma, actor: soleBusinessActor(identity) };
    result = await inviteAdvocate(ctx, parsed.data);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }

  // Sent now rather than after the response, unlike other notifications: the
  // admin is looking at the link and needs to know whether they must send it
  // themselves. Any problem is reported as "not emailed" — the invite exists
  // either way, and the link on screen still works.
  let emailed: "sent" | "skipped" | "failed";
  try {
    const { outcome } = await sendEmail(ctx, {
      kind: "ADVOCATE_INVITE",
      token: result.token,
    });
    emailed = outcome === "duplicate" ? "sent" : outcome;
  } catch (error) {
    console.error("[email] invite not sent", error);
    emailed = "failed";
  }

  revalidatePath("/app/advocates");
  revalidatePath("/app");
  return {
    invitation: {
      email: result.email,
      link: `${serverEnv.appUrl}/invite/${result.token}`,
      expiresAt: result.expiresAt.toISOString(),
      reinvited: result.reinvited,
      emailed,
    },
  };
}
