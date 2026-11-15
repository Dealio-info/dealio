import Link from "next/link";
import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { ForbiddenError, soleBusinessActor } from "@/server/context";
import {
  getDashboardSummary,
  listAdvocateBalances,
} from "@/server/services/analytics/dashboard";
import { getBusinessProfile } from "@/server/services/tenancy/business-profile";
import type { OpportunityStatus } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Stat } from "@/components/app/stat";
import { StatusBadge } from "@/components/app/status-badge";
import { CurrencyAmount } from "@/components/app/currency-amount";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { capitalize, countOf, TERMS } from "@/lib/terms";
import { CURRENCY, formatCurrency } from "@/lib/currency";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Dashboard · Dealio" };

/** Pipeline order: the happy path left to right, then the exits. */
const PIPELINE: readonly OpportunityStatus[] = [
  "PENDING_APPROVAL",
  "REQUESTED",
  "ACCEPTED",
  "COMPLETED",
  "VERIFIED",
  "REWARDED",
  "DECLINED",
  "CANCELLED",
];

/** How many advocates the balances table shows before it stops. */
const TOP = 10;

/**
 * The business's home: what needs doing, what advocacy has been worth, and
 * who is owed what.
 *
 * Every number comes from `analytics/dashboard.ts`; this file only arranges
 * them. Reaching for Prisma here to add "just one more count" is the moment a
 * service function is missing.
 */
export default async function AppHome() {
  const identity = await requireIdentity();

  // Kept from the placeholder this replaces: "No business yet" is the first
  // thing to look for when sign-in works but nothing else does — it means the
  // session resolved and the membership did not.
  if (identity.memberships.length === 0) {
    return (
      <EmptyState
        title="No business yet"
        description={`You are signed in as ${identity.user.email}, but you are not a member of any business. Access comes from being invited — signing up does not grant it.`}
      />
    );
  }

  let actor;
  try {
    actor = soleBusinessActor(identity);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <EmptyState title="More than one business" description={error.message} />;
    }
    throw error;
  }

  const ctx = { db: prisma, actor };
  const [business, summary, balances] = await Promise.all([
    getBusinessProfile(ctx),
    getDashboardSummary(ctx),
    listAdvocateBalances(ctx),
  ]);

  const { attention, currency, advocates } = summary;
  const totalQuests = Object.values(summary.pipeline).reduce((a, b) => a + b, 0);
  const owed = balances.filter((b) => b.balance !== 0).slice(0, TOP);

  const tasks = [
    {
      count: attention.awaitingApproval,
      label: `${capitalize(TERMS.quest.many)} to approve`,
      href: "/app/quests",
    },
    {
      count: attention.awaitingVerification,
      label: `${capitalize(TERMS.quest.many)} to verify`,
      href: "/app/quests",
    },
    {
      count: attention.redemptionsWaiting,
      label: "Redemptions to decide",
      href: "/app/redemptions",
    },
  ] as const;
  const waiting = tasks.filter((t) => t.count > 0);

  return (
    <div className="space-y-10">
      <PageHeader
        title={business.name}
        description="Where your advocacy stands today."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Waiting on you</h2>
        {waiting.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing needs a decision.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {waiting.map((task) => (
              <Link
                key={task.label}
                href={task.href}
                className="bg-card hover:bg-accent rounded-lg border p-4 transition-colors"
              >
                <Stat label={task.label} value={task.count} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">What it has been worth</h2>
        <div className="bg-card grid gap-6 rounded-lg border p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            emphasis
            label="Influenced revenue"
            value={formatCents(summary.influencedRevenueCents)}
            hint={`Recorded when ${TERMS.quest.many} were verified`}
          />
          <Stat
            label={`${capitalize(CURRENCY.many)} awarded`}
            value={currency.awarded.toLocaleString()}
            hint={`For completed ${TERMS.quest.many}`}
          />
          <Stat
            label={`${capitalize(CURRENCY.many)} redeemed`}
            value={currency.redeemed.toLocaleString()}
            hint={
              currency.adjusted !== 0
                ? `Adjustments ${currency.adjusted > 0 ? "+" : ""}${currency.adjusted.toLocaleString()}`
                : `On approved ${TERMS.reward.many}`
            }
          />
          <Stat
            label="Outstanding"
            value={currency.outstanding.toLocaleString()}
            hint={`Earned, not yet spent — ${TERMS.reward.many} you may still fund`}
          />
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            {capitalize(TERMS.quest.many)}
            <span className="text-muted-foreground ml-2 font-normal">
              {totalQuests}
            </span>
          </h2>
          {totalQuests === 0 ? (
            <EmptyState
              title={`No ${TERMS.quest.many} yet`}
              description={`Once you ask an ${TERMS.advocate.one} for a referral, call or testimonial, it moves through these stages.`}
            />
          ) : (
            <ul className="bg-card divide-y rounded-lg border">
              {PIPELINE.map((status) => (
                <li
                  key={status}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <StatusBadge status={status} />
                  <span
                    className={
                      summary.pipeline[status] === 0
                        ? "text-muted-foreground tabular-nums"
                        : "font-medium tabular-nums"
                    }
                  >
                    {summary.pipeline[status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            {capitalize(TERMS.advocate.many)}
            <span className="text-muted-foreground ml-2 font-normal">
              {countOf(advocates.active, { one: "active", many: "active" })}
              {advocates.invited > 0 && ` · ${advocates.invited} invited`}
            </span>
          </h2>
          {owed.length === 0 ? (
            <EmptyState
              title="Nobody is owed anything"
              description={`Balances appear here once ${TERMS.advocate.many} earn ${CURRENCY.many}.`}
            />
          ) : (
            <div className="bg-card rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{capitalize(TERMS.advocate.one)}</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owed.map((row) => (
                    <TableRow key={row.advocateId}>
                      <TableCell>
                        <div className="font-medium">{row.name ?? row.email}</div>
                        {row.name && (
                          <div className="text-muted-foreground text-xs">
                            {row.email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <CurrencyAmount amount={row.balance} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {balances.filter((b) => b.balance !== 0).length > TOP && (
                <p className="text-muted-foreground border-t px-4 py-2 text-xs">
                  Showing the {TOP} largest of {formatCurrency(currency.outstanding)}{" "}
                  owed in total.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
