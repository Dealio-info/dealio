import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { setEmailOptOut } from "@/server/services/email/unsubscribe";

/**
 * RFC 8058 one-click unsubscribe — the target of the `List-Unsubscribe` header.
 *
 * Mail clients that show an "Unsubscribe" button POST here directly, with no
 * page and no person clicking through, so this acts on POST and answers
 * plainly. It never acts on GET: link scanners follow every URL in an email,
 * and one that unsubscribed on GET would unsubscribe everyone whose mail is
 * scanned. A GET is sent to the confirmation page instead.
 *
 * Unknown tokens get the same 200 as known ones. A mail client cannot do
 * anything useful with an error, and a difference would let someone probe for
 * valid tokens.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  await setEmailOptOut(prisma, token, true);
  return new NextResponse("Unsubscribed.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(
    new URL(`/unsubscribe/${encodeURIComponent(token)}`, request.url),
  );
}
