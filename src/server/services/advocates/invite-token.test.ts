import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken } from "./invite-token";

describe("generateInviteToken", () => {
  it("returns a token and the hash that will be stored", () => {
    const { token, tokenHash } = generateInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
  });

  it("carries enough entropy that guessing is not a threat", () => {
    // 32 bytes, base64url, unpadded.
    expect(generateInviteToken().token).toHaveLength(43);
  });

  it("never repeats", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateInviteToken().token),
    );
    expect(tokens.size).toBe(200);
  });

  it("is URL-safe, since it travels in a link", () => {
    for (let i = 0; i < 100; i++) {
      const { token } = generateInviteToken();
      expect(token).not.toMatch(/[+/=]/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });
});

describe("hashInviteToken", () => {
  it("reproduces the hash generate() returned, which is how lookup works", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(hashInviteToken(token)).toBe(tokenHash);
  });

  it("is deterministic", () => {
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
  });

  it("differs for a different token", () => {
    expect(hashInviteToken("abc")).not.toBe(hashInviteToken("abd"));
  });
});
