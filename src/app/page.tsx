import Link from "next/link";
import { redirect } from "next/navigation";
import { currentIdentity } from "@/server/auth";
import { homeFor } from "@/lib/home";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import { Logo, LogoMark } from "@/components/brand/logo";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CURRENCY } from "@/lib/currency";
import { capitalize, TERMS } from "@/lib/terms";

/**
 * The root URL.
 *
 * Signed in, it is a doorway: straight to the person's own side of the app.
 * That matters because signing in without a `next` lands here — before this
 * page existed, a real admin finished signing in on a scaffold placeholder.
 *
 * Signed out, it says what Dealio is, in the README's own words. Positioning,
 * slogan and palette are still with the business lead (`docs/brand-brief.md`),
 * so this is deliberately plain and built from the same tokens and copy
 * constants as the app: when those land, this page changes with everything
 * else.
 */
export default async function Home() {
  const identity = await currentIdentity();
  const home = identity && homeFor(identity);
  if (home) redirect(home);

  return (
    <div className="bg-hero flex min-h-screen flex-col">
      <header>
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {identity ? (
              <SignOutButton />
            ) : (
              <Link href="/sign-in" className={buttonVariants({ size: "sm" })}>
                Sign in
              </Link>
            )}
          </div>
        </div>
        <div aria-hidden="true" className="bg-brand-gradient h-px opacity-70" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        {identity && (
          // Signed in, but nothing to go to: say so plainly rather than show a
          // marketing page to someone who expected their dashboard.
          <p
            role="status"
            className="bg-muted text-muted-foreground mt-8 rounded-lg px-4 py-3 text-sm"
          >
            You are signed in as {identity.user.email}, but this account is not part of
            any business yet. Access comes from an invitation — ask the person who set
            you up to send one.
          </p>
        )}

        <section className="max-w-3xl py-20 sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Turn happy customers into a{" "}
            <span className="text-brand-gradient">repeatable sales advantage.</span>
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-lg">
            Dealio is a customer advocacy platform for B2B SaaS sales teams. Ask your
            customers for referrals, reference calls, testimonials and intros; they earn{" "}
            {CURRENCY.many} for each one they complete and spend them on{" "}
            {TERMS.reward.many} you choose. You see every request, every payout, and the
            revenue it influenced.
          </p>
          <p className="mt-4 font-medium">
            Gamification is the mechanism. Revenue impact is the outcome.
          </p>
          {!identity && (
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/sign-in"
                className={buttonVariants({
                  size: "lg",
                  className: "shadow-glow px-6",
                })}
              >
                Sign in
              </Link>
              <p className="text-muted-foreground text-sm">
                Accounts are set up by invitation.
              </p>
            </div>
          )}
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-2">
          <Card className="motion-safe:hover:shadow-glow transition-shadow">
            <CardHeader>
              <CardTitle>For sales teams</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground space-y-2 text-sm">
                <li>
                  Invite customers as {TERMS.advocate.many} and send them{" "}
                  {TERMS.quest.many} — a reference call before a big deal, an intro, a
                  quote for the website.
                </li>
                <li>
                  Verify what was done, record the revenue it influenced, and pay in{" "}
                  {CURRENCY.many} from a budget you control.
                </li>
                <li>
                  Choose the {TERMS.reward.many} and approve every redemption. You buy
                  and send them yourself; Dealio never holds your money.
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card className="motion-safe:hover:shadow-glow transition-shadow">
            <CardHeader>
              <CardTitle>For your customers</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground space-y-2 text-sm">
                <li>
                  One place to see what a company has asked of you, and to accept or
                  decline.
                </li>
                <li>
                  {capitalize(CURRENCY.many)} for every {TERMS.quest.one} you complete,
                  with a balance and history you can always check.
                </li>
                <li>
                  {capitalize(TERMS.reward.many)} worth having, claimed in a click — and
                  an email at every step, which you can turn off.
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="border-t py-16">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              [
                "Invite",
                `A company invites a customer to be an ${TERMS.advocate.one}.`,
              ],
              ["Ask", `A rep sends them a ${TERMS.quest.one}.`],
              ["Do", "The customer accepts and completes it."],
              ["Verify", `The company confirms it happened and pays ${CURRENCY.many}.`],
              [
                "Redeem",
                `The customer claims a ${TERMS.reward.one}; the company approves and sends it.`,
              ],
            ].map(([step, text], i) => (
              <li key={step} className="space-y-2">
                <p
                  aria-hidden="true"
                  className="bg-brand-gradient text-primary-foreground grid size-8 place-items-center rounded-full text-sm font-bold tabular-nums"
                >
                  {i + 1}
                </p>
                <p className="font-medium">{step}</p>
                <p className="text-muted-foreground text-sm">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex h-14 w-full max-w-5xl items-center px-4 text-sm">
          <LogoMark className="mr-2 size-4" />
          Dealio
        </div>
      </footer>
    </div>
  );
}
