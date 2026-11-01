import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Supabase client holding the **secret** key, which bypasses every
 * authorization check Supabase makes.
 *
 * Only for operations our own service layer has already authorized, and only
 * ever on the server. It is used by the onboarding scripts to provision auth
 * users; nothing in the request path should need it. If a route handler ever
 * wants this, ask first why `supabaseServer()` is not enough.
 *
 * No session handling: `persistSession` and `autoRefreshToken` are off because
 * there is no user session here to keep — this client acts as the project.
 */
export function supabaseAdmin(): SupabaseClient {
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
