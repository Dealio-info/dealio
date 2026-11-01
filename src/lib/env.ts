/**
 * Environment access.
 *
 * Two deliberate choices:
 *
 *  1. **Lazy, via getters.** `next build` runs in CI with no Supabase
 *     credentials, so validating at module load would break the build. Each
 *     value is read on first use and names itself in the error.
 *  2. **Static `process.env.X` references.** Next inlines `NEXT_PUBLIC_*` into
 *     the browser bundle at build time, and it can only do that for literal
 *     property access — a dynamic `process.env[name]` lookup would silently be
 *     `undefined` in the browser. So these are written out longhand rather than
 *     looked up by name.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

/** Safe to reference from browser code. */
export const publicEnv = {
  get supabaseUrl(): string {
    return required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabasePublishableKey(): string {
    return required(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  },
};

/** Server-only. Never reference these from a client component. */
export const serverEnv = {
  /**
   * Bypasses every authorization check in Supabase. Only for admin operations
   * that have already been authorized by our own service layer.
   *
   * This is Supabase's newer `sb_secret_…` key. It replaces the legacy
   * `service_role` JWT, which is deprecated.
   */
  get supabaseSecretKey(): string {
    return required(process.env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY");
  },
  /** Used to build invite and magic links. */
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  },
};
