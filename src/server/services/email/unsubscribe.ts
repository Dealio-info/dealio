import type { Db } from "@/server/db";

export type EmailPreference = {
  readonly businessName: string;
  readonly email: string;
  readonly optedOut: boolean;
};

/** The unsubscribe token is a UUID; anything else cannot match, so do not ask. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where an advocate's emails from one business stand.
 *
 * Takes a `Db`, not a `ServiceContext`: the person following an unsubscribe
 * link may never have signed in, and must not have to. The token is the whole
 * credential, and all it can do is stop or restart one advocate's email from
 * one business — the same person advocating for another company is a separate
 * record with its own token, and is unaffected.
 */
export async function getEmailPreference(
  db: Db,
  token: string,
): Promise<EmailPreference | null> {
  if (!UUID.test(token)) return null;
  const advocate = await db.advocate.findUnique({
    where: { emailUnsubscribeToken: token },
    select: {
      email: true,
      emailOptedOutAt: true,
      business: { select: { name: true } },
    },
  });
  if (!advocate) return null;
  return {
    businessName: advocate.business.name,
    email: advocate.email,
    optedOut: advocate.emailOptedOutAt !== null,
  };
}

/**
 * Stop or restart emails. Idempotent: unsubscribing twice keeps the first
 * date, which is the one that matters if anyone ever asks when consent ended.
 */
export async function setEmailOptOut(
  db: Db,
  token: string,
  optedOut: boolean,
): Promise<EmailPreference | null> {
  if (!UUID.test(token)) return null;
  await db.advocate.updateMany({
    where: optedOut
      ? { emailUnsubscribeToken: token, emailOptedOutAt: null }
      : { emailUnsubscribeToken: token },
    data: { emailOptedOutAt: optedOut ? new Date() : null },
  });
  return getEmailPreference(db, token);
}
