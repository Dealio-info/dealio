import type { Identity } from "@/server/context";

/**
 * Where a signed-in person belongs when they arrive with nowhere particular in
 * mind — the root URL, or signing in without a `next`.
 *
 * Only a destination, never an authority: `/app` and `/advocate` each resolve
 * their own access from the session, so choosing the wrong one here would show
 * "No business yet", not someone else's data.
 *
 * Someone who is both staff somewhere and an advocate somewhere goes to the
 * business side. Which business they then see is still `/app`'s decision, made
 * the usual way — this does not pick a tenant.
 */
export function homeFor(identity: Identity): "/app" | "/advocate" | null {
  if (identity.memberships.length > 0) return "/app";
  if (identity.advocates.length > 0) return "/advocate";
  return null;
}
