"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * The Supabase client for browser code — sign-in, sign-out, and nothing else.
 *
 * It holds the publishable key, which is safe to ship. It has no database
 * access: Postgres is reached only through server-side services. If you find
 * yourself wanting to read application data here, that is a missing service
 * function.
 */
export function supabaseBrowser() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
}
