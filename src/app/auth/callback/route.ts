import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/server/supabase";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Where magic links and OAuth redirects land. Exchanges the one-time code for
 * a session, then sends the person on.
 *
 * The `next` parameter is validated as a same-origin relative path before use —
 * reflecting an arbitrary URL from the query string would be an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
