import { describe, expect, it, vi } from "vitest";
import {
  EmailTransportError,
  fromHeader,
  resendTransport,
  type OutgoingEmail,
} from "./transport";

const email: OutgoingEmail = {
  from: '"Acme via Dealio" <noreply@dealio.info>',
  to: "dana@customer.com",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
  headers: { "List-Unsubscribe": "<https://dealio.info/u/1>" },
};

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("resendTransport", () => {
  it("posts the email with the key, the idempotency key and the headers", async () => {
    const fetch = fakeFetch(200, { id: "msg_123" });

    const result = await resendTransport("re_secret", fetch).send(email, {
      idempotencyKey: "QUEST_REWARDED:abc",
    });

    expect(result).toEqual({ id: "msg_123" });
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_secret",
      "Idempotency-Key": "QUEST_REWARDED:abc",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: email.from,
      to: ["dana@customer.com"],
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      headers: email.headers,
    });
  });

  it("reports Resend's reason on refusal, and never the key", async () => {
    const fetch = fakeFetch(403, {
      name: "validation_error",
      message: "The dealio.info domain is not verified.",
    });

    const error = await resendTransport("re_secret", fetch)
      .send(email, { idempotencyKey: "k" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailTransportError);
    expect(String(error)).toContain("403 validation_error");
    expect(String(error)).toContain("not verified");
    expect(String(error)).not.toContain("re_secret");
  });

  it("treats an unreachable API as a transport error, not a crash", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      resendTransport("re_secret", fetch).send(email, { idempotencyKey: "k" }),
    ).rejects.toThrow(EmailTransportError);
  });

  it("does not take a 200 without an id as success", async () => {
    await expect(
      resendTransport("k", fakeFetch(200, {})).send(email, { idempotencyKey: "k" }),
    ).rejects.toThrow(EmailTransportError);
  });
});

describe("fromHeader", () => {
  it("leads with the business and keeps only the configured address", () => {
    expect(fromHeader("Acme", "Dealio <noreply@dealio.info>")).toBe(
      '"Acme via Dealio" <noreply@dealio.info>',
    );
    expect(fromHeader("Acme", "noreply@dealio.info")).toBe(
      '"Acme via Dealio" <noreply@dealio.info>',
    );
  });

  it("cannot be used to break out of the header", () => {
    const header = fromHeader(
      'Evil" <attacker@x.com>\r\nBcc: victim@y.com',
      "a@dealio.info",
    );
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toBe(
      '"Evil attacker@x.comBcc: victim@y.com via Dealio" <a@dealio.info>',
    );
  });

  it("falls back to Dealio for a name with nothing left", () => {
    expect(fromHeader('""<>', "a@dealio.info")).toBe('"Dealio" <a@dealio.info>');
  });
});
