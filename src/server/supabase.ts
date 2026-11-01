import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client for server components, server actions and route handlers.
 *
 * Reads and writes the session cookies, so it must be created per request —
 * never cached in a module-level variable.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. That is fine: `src/proxy.ts`
          // refreshes the session on every request, so a read-only render here
          // is not a problem worth surfacing.
        }
      },
    },
  });
}
