import { afterEach, describe, expect, it, vi } from "vitest";
import { publicEnv, serverEnv } from "./env";

/**
 * Env access is lazy on purpose. `next build` runs in CI with no Supabase
 * credentials, so validating at module load would break the build; instead each
 * value is read on first use and names itself in the error.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicEnv", () => {
  it("returns a configured value", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(publicEnv.supabaseUrl).toBe("https://example.supabase.co");
  });

  it("names the missing variable in the error", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => publicEnv.supabaseUrl).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("points at .env.example so the fix is obvious", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => publicEnv.supabasePublishableKey).toThrow(/\.env\.example/);
  });
});

describe("serverEnv", () => {
  it("reads the secret key", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_example");
    expect(serverEnv.supabaseSecretKey).toBe("sb_secret_example");
  });

  it("throws when the secret key is absent", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => serverEnv.supabaseSecretKey).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("defaults the app URL for local development", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(serverEnv.appUrl).toBe("http://localhost:3000");
  });

  it("uses a configured app URL when present", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dealio.info");
    expect(serverEnv.appUrl).toBe("https://dealio.info");
  });
});

describe("serverEnv.appUrl", () => {
  it("drops trailing slashes, since every caller appends a path", () => {
    // `${appUrl}/invite/…` with "https://dealio.info/" would build
    // "https://dealio.info//invite/…".
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dealio.info/");
    expect(serverEnv.appUrl).toBe("https://dealio.info");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dealio.info///");
    expect(serverEnv.appUrl).toBe("https://dealio.info");
  });

  it("leaves a clean value alone, and trims stray whitespace", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dealio.info");
    expect(serverEnv.appUrl).toBe("https://dealio.info");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "  https://dealio.info/ \n");
    expect(serverEnv.appUrl).toBe("https://dealio.info");
  });

  it("falls back to localhost when unset or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(serverEnv.appUrl).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "  ");
    expect(serverEnv.appUrl).toBe("http://localhost:3000");
  });
});
