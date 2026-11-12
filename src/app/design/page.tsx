import Link from "next/link";
import { Section } from "./theme-pair";
import { BrandSwatches, SemanticSwatches, StatusSwatches } from "./swatches";
import { StatusBadge } from "@/components/app/status-badge";
import { QuestCard } from "@/components/app/quest-card";
import { RewardCard } from "@/components/app/reward-card";
import { CurrencyAmount } from "@/components/app/currency-amount";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Stat } from "@/components/app/stat";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import { capitalize, TERMS } from "@/lib/terms";

export const metadata = {
  title: "Design · Dealio",
  description: "Every token and component the interface is built from.",
};

const STATUSES = [
  "PENDING_APPROVAL",
  "REQUESTED",
  "ACCEPTED",
  "COMPLETED",
  "VERIFIED",
  "REWARDED",
  "DECLINED",
  "CANCELLED",
];

/**
 * The living style guide.
 *
 * Here so the design can be reviewed by using it rather than by reading a
 * description of it — resize the window, click the controls, compare the two
 * themes. Everything on this page is the real component the product uses, so
 * anything that looks wrong here is wrong there.
 *
 * It is deliberately greyscale. The palette comes from the business lead
 * (`docs/brand-brief.md`); the job of this pass was to make sure that arriving
 * late costs one file, which is why every colour below is a named role.
 *
 * Not gated behind auth or an environment check — it holds no data. One line in
 * this file would hide it in production if that is ever wanted.
 */
export default function DesignPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Design</h1>
          <ThemeToggle />
        </div>
        <p className="text-muted-foreground max-w-prose text-sm">
          Every token and component the interface is built from. Neutral on purpose —
          the palette is pending, and each colour here is a role the theme redefines in
          one place. The toggle sets the real theme; the paired panes below always show
          both at once, so a change can be checked against the other without switching.
        </p>
        {/*
          shadcn's `base-vega` style is built on Base UI, which has no `asChild`
          — it uses a `render` prop. For a link that looks like a button,
          applying `buttonVariants` directly is simpler than either.
        */}
        <nav className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/app"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Business shell
          </Link>
          <Link
            href="/advocate"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Advocate shell
          </Link>
          <Link
            href="/sign-in"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Sign in
          </Link>
        </nav>
      </header>

      <Section
        title="Semantic tokens"
        description="What components actually reference. The theme redefines these; nothing hardcodes a colour."
      >
        <SemanticSwatches />
      </Section>

      <Section
        title="Brand tokens"
        description="Sketched from the brief and not final. Used nowhere yet — deliberately, until the palette is confirmed."
      >
        <BrandSwatches />
      </Section>

      <Section
        title="Status roles"
        description="Five roles covering eight lifecycle statuses. Neutral now; giving these hue is the single change that makes a pipeline scannable."
      >
        <StatusSwatches />
      </Section>

      <Section
        title="Type scale"
        description="One heading size per level. Pages that invent their own are how an app stops looking like one app."
      >
        <div className="space-y-2">
          <p className="text-3xl font-semibold tracking-tight">Display — page title</p>
          <p className="text-2xl font-semibold tracking-tight">Heading — section</p>
          <p className="text-lg font-semibold tracking-tight">Subheading</p>
          <p className="text-sm">Body — the default for most text.</p>
          <p className="text-muted-foreground text-sm">
            Muted body — secondary detail.
          </p>
          <p className="text-muted-foreground text-xs">Caption — timestamps, hints.</p>
          <p className="font-mono text-xs">01a198e6-c0ac-77f8 — identifiers</p>
        </div>
      </Section>

      <Section
        title="Lifecycle statuses"
        description="The same status reads differently to each audience: a rep's “Sent” is an advocate's “New”."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Business</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Advocate</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <StatusBadge key={s} status={s} audience="advocate" />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Currency"
        description="The name is a placeholder and lives in one constant, so it is never spelled out in a component."
      >
        <div className="flex items-end gap-6">
          <CurrencyAmount amount={1} />
          <CurrencyAmount amount={48} />
          <CurrencyAmount amount={1250} size="large" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      <Section
        title="Form controls"
        description="Native forms with server actions rather than a form library — one less dependency, and they work before hydration."
      >
        <div className="max-w-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-email">Email</Label>
            <Input id="d-email" type="email" placeholder="ceo@customer.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-note">Note</Label>
            <Textarea
              id="d-note"
              placeholder="Anything the reviewer should know"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-off">Disabled</Label>
            <Input id="d-off" disabled placeholder="Not editable" />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="d-policy" />
            <Label htmlFor="d-policy" className="text-sm font-normal">
              Let reps send {TERMS.quest.many} without approval
            </Label>
          </div>
        </div>
      </Section>

      <Section
        title="Page header"
        description="One component so every page agrees on where the title, the explanation and the primary action sit."
      >
        <PageHeader
          title={capitalize(TERMS.quest.many)}
          description={`Referrals, reference calls and testimonials you have asked ${TERMS.advocate.many} for.`}
          action={<Button size="sm">New {TERMS.quest.one}</Button>}
        />
      </Section>

      <Section title="Cards and stats">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reference call for Acme</CardTitle>
              <CardDescription>Casey Chen · Customer Inc</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <StatusBadge status="ACCEPTED" />
              <CurrencyAmount amount={5} />
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={capitalize(TERMS.advocate.many)} value="12" />
            <Stat label="Open" value="4" />
            <Stat label="Awarded" value={<CurrencyAmount amount={310} />} />
            <Stat label="Influenced" value="$48,200" hint="Closed-won, last 90 days" />
          </div>
        </div>
      </Section>

      <Section
        title="A quest, as the advocate sees it"
        description="The real component, with plain buttons standing in for the form. Needs-you items lead; everything else is quieter."
      >
        <div className="space-y-3">
          <QuestCard
            title="Reference call for Acme"
            subtitle="Jordan Reyes · Northwind"
            status="REQUESTED"
            rewardAmount={5}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Accept</Button>
                <Button size="sm" variant="outline">
                  Decline
                </Button>
              </div>
            }
          />
          <QuestCard
            title="Testimonial for the website"
            status="REWARDED"
            rewardAmount={8}
            quiet
          />
        </div>
      </Section>

      <Section
        title="A reward, as the advocate sees it"
        description="The gap is stated, not just the price. “Four more and this is yours” is a reason to do another quest; a greyed-out card is only a refusal."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <RewardCard
            name="$25 coffee card"
            description="Delivered by email within two working days"
            cost={5}
            balance={8}
            action={<Button size="sm">Claim</Button>}
          />
          <RewardCard
            name="$100 Lululemon gift card"
            description="Delivered by email"
            cost={20}
            balance={8}
          />
        </div>
      </Section>

      <Section title="Tables">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{capitalize(TERMS.advocate.one)}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Casey Chen</TableCell>
              <TableCell>
                <StatusBadge status="REWARDED" />
              </TableCell>
              <TableCell className="text-right tabular-nums">48</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Dana Okafor</TableCell>
              <TableCell>
                <StatusBadge status="REQUESTED" />
              </TableCell>
              <TableCell className="text-right tabular-nums">0</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Empty states"
        description="The first thing a new customer sees. Every one should name the next action."
      >
        <EmptyState
          title={`No ${TERMS.advocate.many} yet`}
          description={`Invite a customer and they will appear here once they accept.`}
          action={<Button size="sm">Invite an {TERMS.advocate.one}</Button>}
        />
      </Section>

      <Section title="Alerts">
        <div className="space-y-3">
          <Alert>
            <AlertTitle>Waiting for approval</AlertTitle>
            <AlertDescription>
              An admin needs to sign this off before it reaches the {TERMS.advocate.one}
              .
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Not enough balance</AlertTitle>
            <AlertDescription>
              This reward costs more than has been earned so far.
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section
        title="Loading"
        description="Skeletons matched to the shape of what is coming, so the page does not jump."
      >
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Separator />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </Section>

      <section className="text-muted-foreground space-y-2 border-t pt-8 text-sm">
        <p>
          <strong className="text-foreground">What is pending.</strong> The palette, the
          logo, the slogan, the currency name, and whether “{TERMS.quest.one}” is the
          right word. See <code>docs/brand-brief.md</code>.
        </p>
        <p>
          <strong className="text-foreground">What will not change cheaply.</strong>{" "}
          Layout and hierarchy — what a page leads with, how a pipeline is grouped.
          Those are decided here, which is why this page exists to be argued with.
        </p>
      </section>
    </div>
  );
}
