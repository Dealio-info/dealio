import type { Db } from "@/server/db";
import { ConflictError } from "@/server/context";

export type EnsureUserInput = {
  readonly supabaseUserId: string;
  readonly email: string;
  readonly name?: string | null;
};

/**
 * Provision the domain `User` row for a Supabase auth user, idempotently.
 *
 * Called on sign-in, before `resolveIdentity`. Creating the row confers no
 * access at all: a user with no `Membership` and no claimed `Advocate` record
 * has no tenant context and cannot reach any business's data. Access comes from
 * being invited, never from signing up.
 *
 * Email is kept in step with Supabase when it changes for the same auth user.
 * But a *different* auth user arriving with an email already held by another
 * row is refused rather than relinked — silently moving an email between
 * accounts is an account-takeover shape, and the legitimate version of this
 * (someone deleted and recreated in Supabase) is rare enough to be worth a
 * human looking at.
 */
export async function ensureUser(
  db: Db,
  input: EnsureUserInput,
): Promise<{ id: string; email: string }> {
  const existingByEmail = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, supabaseUserId: true },
  });

  if (existingByEmail && existingByEmail.supabaseUserId !== input.supabaseUserId) {
    throw new ConflictError(
      "That email address already belongs to another account. " +
        "This needs a human: relinking it automatically would be an account takeover.",
    );
  }

  return db.user.upsert({
    where: { supabaseUserId: input.supabaseUserId },
    create: {
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      name: input.name ?? null,
    },
    update: {
      email: input.email,
      // Only overwrite the stored name when the provider actually gave one, so
      // a magic-link sign-in does not blank a name set by a Google sign-in.
      ...(input.name ? { name: input.name } : {}),
    },
    select: { id: true, email: true },
  });
}
