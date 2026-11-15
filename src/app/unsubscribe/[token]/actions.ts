"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { setEmailOptOut } from "@/server/services/email/unsubscribe";

const schema = z.object({
  token: z.string().min(1).max(100),
  choice: z.enum(["stop", "resume"]),
});

/**
 * Stop or restart one advocate's emails from one business. No sign-in: the
 * token in the link is the credential, and all it can do is this.
 */
export async function changeEmailPreference(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    choice: formData.get("choice"),
  });
  if (!parsed.success) return;
  await setEmailOptOut(prisma, parsed.data.token, parsed.data.choice === "stop");
  revalidatePath(`/unsubscribe/${parsed.data.token}`);
}
