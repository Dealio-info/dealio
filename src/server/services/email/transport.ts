import { serverEnv } from "@/lib/env";

/** An email with everything decided: who, what, and the headers. */
export type OutgoingEmail = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly headers: Readonly<Record<string, string>>;
};

/**
 * Something that can deliver an email. Production uses Resend; development
 * without a key logs to the console; tests record what they were given.
 *
 * `idempotencyKey` is passed through to the provider, so a request that
 * reached it but whose response was lost cannot be delivered twice on retry.
 */
export interface EmailTransport {
  send(
    email: OutgoingEmail,
    options: { idempotencyKey: string },
  ): Promise<{ id: string }>;
}

export class EmailTransportError extends Error {
  override readonly name = "EmailTransportError";
}

/**
 * Resend's REST API, called directly. One endpoint and two headers do not
 * justify an SDK dependency, and owning the request means the test can check
 * exactly what is sent.
 */
export function resendTransport(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): EmailTransport {
  return {
    async send(email, { idempotencyKey }) {
      let response: Response;
      try {
        response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            from: email.from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: email.headers,
          }),
        });
      } catch (error) {
        throw new EmailTransportError(
          `Could not reach Resend: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const body = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
        name?: string;
      } | null;
      if (!response.ok || !body?.id) {
        // Resend's own explanation, never the request — that holds the key.
        throw new EmailTransportError(
          `Resend refused the email (${response.status}${body?.name ? ` ${body.name}` : ""}): ${
            body?.message ?? "no explanation given"
          }`,
        );
      }
      return { id: body.id };
    },
  };
}

/** Development without a key: say what would have been sent, send nothing. */
export const consoleTransport: EmailTransport = {
  async send(email, { idempotencyKey }) {
    console.info(
      [
        `[email] not sent — RESEND_API_KEY is not set (${idempotencyKey})`,
        `  from:    ${email.from}`,
        `  to:      ${email.to}`,
        `  subject: ${email.subject}`,
        "",
        email.text,
      ].join("\n"),
    );
    return { id: `console:${idempotencyKey}` };
  },
};

/**
 * Production without a key: refuse, so each attempt is recorded as `FAILED`
 * with the reason, rather than looking sent while going nowhere.
 */
const missingKeyTransport: EmailTransport = {
  async send() {
    throw new EmailTransportError("RESEND_API_KEY is not set, so nothing was sent");
  },
};

export function defaultTransport(): EmailTransport {
  const key = serverEnv.resendApiKey;
  if (key) return resendTransport(key);
  return process.env.NODE_ENV === "production" ? missingKeyTransport : consoleTransport;
}

/**
 * The `From` header for a business's email: "Acme via Dealio <address>".
 *
 * Advocates know the business, not Dealio, so the business leads; "via Dealio"
 * says who actually sent it, which is both honest and what keeps the address
 * on our verified domain. Only the address is taken from `EMAIL_FROM`. The
 * name is stripped of the characters that could end the quoted display name
 * or start a header, since it comes from whatever the business called itself.
 */
export function fromHeader(businessName: string, emailFrom: string): string {
  const address = /<([^>]+)>/.exec(emailFrom)?.[1] ?? emailFrom.trim();
  const name = businessName.replace(/["<>\\\r\n]/g, "").trim();
  return `"${name ? `${name} via Dealio` : "Dealio"}" <${address}>`;
}
