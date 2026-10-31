import "server-only";

import { prisma } from "./db";
import { supabaseServer } from "./supabase";
import { UnauthenticatedError, type Identity } from "./context";
import { ensureUser } from "./services/identity/ensure-user";
import { resolveIdentity } from "./services/identity/resolve-identity";

/**
 * Bridge from a Supabase session to a domain `Identity`.
 *
 * Uses `getUser()` rather than `getSession()`: `getSession()` trusts whatever
 * is in the cookie, while `getUser()` validates the token with Supabase. Never
 * make an authorization decision from `getSession()`.
 *
 * Returns the full `Identity` — every business the person is staff of or an
 * advocate for — and leaves choosing a context to the caller, which then names
 * the business it means. See `src/server/context.ts`.
 */
export async function currentIdentity(): Promise<Identity | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  try {
    return await resolveIdentity(prisma, user.id);
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) throw error;
  }

  // First sign-in: no domain row yet. Provision it, then resolve. Doing this
  // only on the miss keeps the common path read-only rather than writing on
  // every page load.
  //
  // Provisioning grants no access — a user with no Membership and no claimed
  // Advocate record has no tenant context at all.
  await ensureUser(prisma, {
    supabaseUserId: user.id,
    email: user.email,
    name:
      typeof user.user_metadata?.["full_name"] === "string"
        ? user.user_metadata["full_name"]
        : null,
  });

  return resolveIdentity(prisma, user.id);
}

/** For server components and actions that must have a signed-in person. */
export async function requireIdentity(): Promise<Identity> {
  const identity = await currentIdentity();
  if (!identity) {
    throw new UnauthenticatedError();
  }
  return identity;
}
