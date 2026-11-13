"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireIdentity } from "@/server/auth";
import { ServiceError } from "@/server/context";
import { claimInvite } from "@/server/services/advocates/claim-invite";

export type ClaimState = { readonly error?: string };

/**
 * Shape only. Whether it is a real token is `claimInvite`'s question, and it
 * answers "not valid" for anything unknown — so there is no format to keep in
 * step with the generator here.
 */
const schema = z.object({ token: z.string().min(1).max(200) });

/**
 * Accept an invite. The only place in the app that claims one.
 *
 * A POST from an explicit button, never a side effect of opening the link:
 * mail scanners and prefetchers follow links unprompted, and the token is
 * single-use. The signed-in user comes from the session; the token is the only
 * other input, and it is the whole credential — there is no email match, and
 * there must never be one.
 */
export async function acceptInvite(
  _prev: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const parsed = schema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { error: "That invite link is not valid" };

  const identity = await requireIdentity();
  try {
    await claimInvite(prisma, { token: parsed.data.token, userId: identity.user.id });
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    throw error;
  }
  // Outside the try: `redirect` works by throwing, and must not be caught.
  redirect("/advocate");
}
