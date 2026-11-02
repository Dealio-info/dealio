import { NextResponse } from "next/server";
import { supabaseServer } from "@/server/supabase";
import { serverEnv } from "@/lib/env";

/**
 * Sign out and go home.
 *
 * POST rather than a link, because a GET that destroys a session can be
 * triggered by anything that fetches a URL — including the browser's own link
 * prefetching, which would sign people out as they hovered.
 */
export async function POST() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", serverEnv.appUrl), {
    // 303 so the browser follows with GET rather than repeating the POST.
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
