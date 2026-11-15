import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { getEmailPreference } from "@/server/services/email/unsubscribe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryFrame } from "@/components/brand/entry-frame";
import { TERMS } from "@/lib/terms";
import { changeEmailPreference } from "./actions";

export const metadata: Metadata = {
  title: "Email preferences · Dealio",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * Where the unsubscribe link in an email's footer lands.
 *
 * Opening it changes nothing — link scanners open every URL in an email — and
 * the change is a button. The same page restarts emails, so a mistaken click
 * is one more click to undo rather than a support request.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preference = await getEmailPreference(prisma, token);

  return (
    <EntryFrame>
      <Card className="shadow-glow">
        {!preference ? (
          <>
            <CardHeader>
              <CardTitle className="text-xl">This link is not valid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                It may have been copied incompletely. Use the link at the bottom of any
                email you received.
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-xl">
                {preference.optedOut
                  ? `You will not get emails from ${preference.businessName}`
                  : `Emails from ${preference.businessName}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {preference.optedOut
                  ? `${preference.email} is unsubscribed. You can still sign in to see your ${TERMS.quest.many} and ${TERMS.reward.many}; nothing else changes.`
                  : `${preference.email} gets an email when ${preference.businessName} sends you a ${TERMS.quest.one}, pays you, or decides on a ${TERMS.reward.one} you claimed.`}
              </p>
              <form action={changeEmailPreference}>
                <input type="hidden" name="token" value={token} />
                {preference.optedOut ? (
                  <Button type="submit" name="choice" value="resume" variant="outline">
                    Start emails again
                  </Button>
                ) : (
                  <Button type="submit" name="choice" value="stop">
                    Unsubscribe
                  </Button>
                )}
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </EntryFrame>
  );
}
