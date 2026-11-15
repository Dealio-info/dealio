import Link from "next/link";
import type { AdvocateActor } from "@/server/context";
import type { AdvocateDashboard } from "@/server/services/advocates/advocate-dashboard";
import {
  availableAdvocateVerbs,
  type AdvocateVerb,
} from "@/server/services/opportunities/advocate-verbs";
import type { OpportunitySummary } from "@/server/services/opportunities/list-opportunities";
import { PageHeader } from "@/components/app/page-header";
import { CurrencyAmount } from "@/components/app/currency-amount";
import { QuestCard } from "@/components/app/quest-card";
import { RewardCard } from "@/components/app/reward-card";
import { RedemptionRow } from "@/components/app/redemption-row";
import { ActivityRow } from "@/components/app/activity-row";
import { buttonVariants } from "@/components/ui/button";
import { capitalize, questTypeLabel, TERMS } from "@/lib/terms";
import { CURRENCY } from "@/lib/currency";
import { QuestActions } from "./quest-actions";
import { ClaimButton } from "./rewards/claim-button";

/*
 * One business's part of the advocate dashboard.
 *
 * Its own file, rather than inside page.tsx, so it can be rendered in a test
 * with sample data — a page module may only export what Next allows, and the
 * signed-in page cannot be reached from a test at all.
 */

/** How each verb reads on a button, which depends on where the quest is. */
function labelFor(verb: AdvocateVerb, status: string): string {
  if (verb === "accept") return "Accept";
  if (verb === "complete") return "Mark done";
  // Declining before starting is "no"; after accepting it is "I can't after all".
  return status === "ACCEPTED" ? "Cannot do this" : "Decline";
}

/** Rewards the dashboard shows before pointing at the full catalog. */
const REWARDS_SHOWN = 3;
/** Movements of currency shown before the history stops. */
const ACTIVITY_SHOWN = 5;
/** Redemption states that are still in motion, worth surfacing on the home page. */
const OPEN_CLAIM = new Set(["REQUESTED", "APPROVED", "ORDERED"]);

export function BusinessSection({
  actor,
  dashboard,
}: {
  actor: AdvocateActor;
  dashboard: AdvocateDashboard;
}) {
  const withVerbs = dashboard.opportunities.map((o) => ({
    opportunity: o,
    verbs: availableAdvocateVerbs({
      status: o.status,
      actor,
      // `listOpportunities` returns only this advocate's quests, so every one
      // shown here is theirs; stated rather than assumed.
      isAssigned: o.advocateId === dashboard.advocateId,
    }),
  }));
  const needsYou = withVerbs.filter((q) => q.verbs.length > 0);
  const everythingElse = withVerbs.filter((q) => q.verbs.length === 0);

  // Everything affordable now, cheapest first, then the cheapest thing that is
  // not — so there is always a next goal in view, not only what is already won.
  const affordable = dashboard.rewards.filter((r) => r.cost <= dashboard.available);
  const nextGoal = dashboard.rewards.find((r) => r.cost > dashboard.available);
  const withinReach = [
    ...affordable.slice(0, nextGoal ? REWARDS_SHOWN - 1 : REWARDS_SHOWN),
    ...(nextGoal ? [nextGoal] : []),
  ];

  const openClaims = dashboard.redemptions.filter((r) => OPEN_CLAIM.has(r.status));
  const held = dashboard.balance - dashboard.available;

  return (
    <section className="space-y-10">
      <PageHeader
        title={dashboard.businessName}
        description={`What ${dashboard.businessName} has asked of you, what you have earned, and what it buys.`}
        action={
          <div className="text-right">
            <CurrencyAmount amount={dashboard.balance} size="large" />
            <p className="text-muted-foreground text-xs">Your balance</p>
            {held > 0 && (
              <p className="text-muted-foreground text-xs">
                {dashboard.available.toLocaleString()} free · {held.toLocaleString()}{" "}
                held for a claim
              </p>
            )}
            {dashboard.earned > 0 && (
              <p className="text-muted-foreground text-xs">
                {dashboard.earned.toLocaleString()} earned in total
              </p>
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          Needs you
          {needsYou.length > 0 && (
            <span className="text-muted-foreground ml-2 font-normal">
              {needsYou.length}
            </span>
          )}
        </h2>
        {needsYou.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {dashboard.opportunities.length === 0
              ? `Nothing yet. When ${dashboard.businessName} asks you for a referral, a reference call or a testimonial, it will appear here.`
              : `Nothing waiting on you. ${dashboard.businessName} will be in touch.`}
          </p>
        ) : (
          needsYou.map(({ opportunity, verbs }) => (
            <AdvocateQuest
              key={opportunity.id}
              businessId={dashboard.businessId}
              opportunity={opportunity}
              verbs={verbs}
            />
          ))
        )}
      </div>

      {dashboard.rewards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">Within reach</h2>
            <Link
              href="/advocate/rewards"
              className={buttonVariants({ variant: "link", size: "sm" })}
            >
              All {TERMS.reward.many}
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {withinReach.map((reward) => (
              <RewardCard
                key={reward.id}
                name={reward.name}
                description={reward.description}
                cost={reward.cost}
                balance={dashboard.available}
                action={
                  <ClaimButton
                    businessId={dashboard.businessId}
                    rewardId={reward.id}
                    affordable={reward.cost <= dashboard.available}
                  />
                }
              />
            ))}
          </div>
        </div>
      )}

      {openClaims.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Your claims</h2>
          {openClaims.map((redemption) => (
            <RedemptionRow
              key={redemption.id}
              redemption={redemption}
              audience="advocate"
              showAdvocate={false}
            />
          ))}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            {capitalize(CURRENCY.many)} in and out
          </h2>
          {dashboard.activity.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing yet. {capitalize(CURRENCY.many)} arrive here when a{" "}
              {TERMS.quest.one} you completed is verified.
            </p>
          ) : (
            <ul className="divide-y">
              {dashboard.activity.slice(0, ACTIVITY_SHOWN).map((item) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  businessName={dashboard.businessName}
                />
              ))}
            </ul>
          )}
        </div>

        {everythingElse.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-muted-foreground text-sm font-medium">
              Other {TERMS.quest.many}
            </h2>
            {everythingElse.map(({ opportunity }) => (
              <AdvocateQuest
                key={opportunity.id}
                businessId={dashboard.businessId}
                opportunity={opportunity}
                verbs={[]}
                quiet
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AdvocateQuest({
  businessId,
  opportunity,
  verbs,
  quiet,
}: {
  businessId: string;
  opportunity: OpportunitySummary;
  verbs: readonly AdvocateVerb[];
  quiet?: boolean;
}) {
  const subtitle =
    [
      questTypeLabel(opportunity.type),
      opportunity.prospectName,
      opportunity.prospectCompany,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <QuestCard
      title={opportunity.title}
      subtitle={subtitle}
      status={opportunity.status}
      rewardAmount={opportunity.rewardAmount}
      quiet={quiet}
      actions={
        verbs.length > 0 && (
          <QuestActions
            businessId={businessId}
            opportunityId={opportunity.id}
            options={verbs.map((verb, i) => ({
              value: verb,
              label: labelFor(verb, opportunity.status),
              // The first is the move forward; the rest are ways out.
              variant: i === 0 ? "default" : "outline",
            }))}
          />
        )
      }
    />
  );
}
