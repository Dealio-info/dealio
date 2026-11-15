import "server-only";

import { after } from "next/server";
import type { ServiceContext } from "@/server/context";
import { sendEmail, type EmailRequest } from "@/server/services/email/send";

/**
 * Email about something that has just happened, after the response is sent.
 *
 * For notifications the person acting does not wait on: a quest sent, a reward
 * paid, a redemption decided. `after` runs once the response is on its way —
 * on Vercel it keeps the function alive until this finishes — so a slow mail
 * provider never slows a button, and a failure never turns a successful action
 * into an error page. `sendEmail` records every outcome in `email_sends`; this
 * only logs the ones that need a person to look.
 *
 * Call it only after the service call that made the event happen has returned,
 * so the email cannot announce something that was then rolled back.
 */
export function emailAfterResponse(ctx: ServiceContext, request: EmailRequest): void {
  after(async () => {
    try {
      const { outcome, idempotencyKey } = await sendEmail(ctx, request);
      if (outcome === "failed") {
        console.warn(
          `[email] ${idempotencyKey} failed — see email_sends for the reason`,
        );
      }
    } catch (error) {
      // A refusal here is a bug in the caller (an event that did not happen,
      // a record from elsewhere), not a delivery problem. Log it loudly; the
      // action it followed has already succeeded and must stay that way.
      console.error(`[email] ${request.kind} refused`, error);
    }
  });
}
