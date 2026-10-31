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
  it("reads the service role key", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    expect(serverEnv.supabaseServiceRoleKey).toBe("service-key");
  });

  it("throws when the service role key is absent", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => serverEnv.supabaseServiceRoleKey).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
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
