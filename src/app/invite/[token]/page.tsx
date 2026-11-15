import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { currentIdentity } from "@/server/auth";
import { previewInvite } from "@/server/services/advocates/preview-invite";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TERMS } from "@/lib/terms";
import { CURRENCY } from "@/lib/currency";
import { AcceptForm } from "./accept-form";

/**
 * The token is in the URL, so keep it out of `Referer` headers and search
 * indexes. Neither would let anyone claim it once it is used, but there is no
 * reason to spread a live credential around while it is not.
 */
export const metadata: Metadata = {
  title: "Your invitation · Dealio",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * Where an invite link lands.
 *
 * Opening it changes nothing — this page only previews. Accepting is a button
 * and a POST, so the mail scanner that follows the link before the person does
 * cannot use it up. Deliberately outside `/advocate`: the visitor is not an
 * advocate yet, and may not even be signed in.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const identity = await currentIdentity();
  const preview = await previewInvite(prisma, {
    token,
    userId: identity?.user.id ?? null,
  });

  if (preview?.state === "yours") redirect("/advocate");

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-16">
      <Card>
        {!preview ? (
          <Message
            title="This link is not valid"
            body="It may have been copied incompletely. Ask whoever sent it for a new one."
          />
        ) : preview.state === "used" ? (
          <Message
            title="This invitation has already been used"
            body={`If that was you, sign in with the account you used. Otherwise ask ${preview.businessName} for a new link.`}
          />
        ) : preview.state === "expired" ? (
          <Message
            title="This invitation has expired"
            body={`Ask ${preview.businessName} to send you a new one.`}
          />
        ) : preview.state === "deactivated" ? (
          <Message
            title="This invitation is no longer active"
            body={`${preview.businessName} has turned it off. Contact them if you think that is a mistake.`}
          />
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-xl">
                {preview.businessName} invited you to be an {TERMS.advocate.one}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                You will see the {TERMS.quest.many} they ask of you, earn{" "}
                {CURRENCY.many} for the ones you complete, and spend them on{" "}
                {TERMS.reward.many} they offer.
              </p>
              <p className="text-muted-foreground text-sm">
                Sent to <span className="text-foreground">{preview.email}</span>.
              </p>

              {identity ? (
                <>
                  {identity.user.email.toLowerCase() !== preview.email && (
                    // Allowed — the link is the credential, and people use
                    // work and personal addresses interchangeably — but worth
                    // saying before they attach the wrong account for good.
                    <p className="text-muted-foreground border-l-2 pl-3 text-sm">
                      You are signed in as {identity.user.email}. Accepting links this
                      invitation to that account.
                    </p>
                  )}
                  <AcceptForm token={token} />
                </>
              ) : (
                <Link
                  href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className={buttonVariants({ className: "w-full" })}
                >
                  Sign in to accept
                </Link>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{body}</p>
      </CardContent>
    </>
  );
}
