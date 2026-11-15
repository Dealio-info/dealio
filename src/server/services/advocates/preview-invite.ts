import type { Db } from "@/server/db";
import { hashInviteToken } from "./invite-token";

/**
 * What an invite link would do, without doing it.
 *
 * - `open`: claimable now.
 * - `yours`: already claimed by the person asking — send them to their
 *   dashboard rather than reporting the link as used.
 * - `used`: claimed, or the advocate record is linked to someone else.
 * - `expired`, `deactivated`: as named; the business has to act.
 */
export type InviteState = "open" | "yours" | "used" | "expired" | "deactivated";

export type InvitePreview = {
  readonly state: InviteState;
  readonly businessName: string;
  /** The address the business invited. Shown so a person can tell a misdirected link. */
  readonly email: string;
};

/**
 * Look an invite up by its token and report what claiming it would do.
 *
 * **Reads only.** The invite page calls this on GET and claims only on an
 * explicit POST, because email clients, link scanners and browser prefetch all
 * follow links on their own, and the token is single-use. A page that claimed
 * on GET would hand the invite to whichever bot looked first.
 *
 * Like `claimInvite`, this takes a `Db` rather than a `ServiceContext`: the
 * person looking has no tenant context yet. The token is the only credential,
 * and anyone holding it may see which business sent it and to which address —
 * that is no more than the email it arrived in already said.
 *
 * Returns `null` for a token that matches nothing, malformed or not. There is
 * nothing to learn from the difference.
 *
 * The checks mirror `claimInvite`'s, in its order, so a link previewed as
 * `open` is one the claim will accept unless something changes in between —
 * and if it does, the claim refuses with its own message.
 */
export async function previewInvite(
  db: Db,
  input: { readonly token: string; readonly userId?: string | null },
): Promise<InvitePreview | null> {
  const invite = await db.advocateInvite.findUnique({
    where: { tokenHash: hashInviteToken(input.token) },
    select: {
      expiresAt: true,
      claimedAt: true,
      advocate: {
        select: {
          email: true,
          userId: true,
          status: true,
          business: { select: { name: true } },
        },
      },
    },
  });
  if (!invite) return null;

  const { advocate } = invite;
  const base = { businessName: advocate.business.name, email: advocate.email };

  if (invite.claimedAt && input.userId && advocate.userId === input.userId) {
    return { ...base, state: "yours" };
  }
  if (invite.claimedAt) return { ...base, state: "used" };
  if (invite.expiresAt.getTime() <= Date.now()) return { ...base, state: "expired" };
  if (advocate.userId) return { ...base, state: "used" };
  if (advocate.status === "INACTIVE") return { ...base, state: "deactivated" };
  return { ...base, state: "open" };
}
