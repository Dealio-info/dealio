import { createHash, randomBytes } from "node:crypto";

/**
 * Invite tokens: generated once, stored only as a hash.
 *
 * The plaintext token is returned to the caller exactly once, to put in an
 * email, and never persisted. A database dump therefore yields no working
 * invite links — which matters more than usual here, because claiming an
 * invite is what links a real person to an `Advocate` record and its currency
 * balance.
 *
 * **SHA-256, deliberately, and not bcrypt or argon2.** Those exist to make
 * guessing a low-entropy secret slow. This token is 256 bits of CSPRNG output,
 * so there is nothing to guess: a KDF would add latency and no security. The
 * rule of thumb is that stretching protects *chosen* secrets, not generated
 * ones.
 *
 * Lookup is a single equality match on a unique index over the hash, so a
 * wrong token takes the same path as a right one.
 */

const TOKEN_BYTES = 32;

export type GeneratedInviteToken = {
  /** Goes in the email. Shown once; never stored. */
  readonly token: string;
  /** Goes in the database. */
  readonly tokenHash: string;
};

export function generateInviteToken(): GeneratedInviteToken {
  // base64url so it survives a URL without escaping.
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
