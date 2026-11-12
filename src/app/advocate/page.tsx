import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { advocateActor } from "@/server/context";
import {
  getAdvocateDashboard,
  type AdvocateDashboard,
} from "@/server/services/advocates/advocate-dashboard";
import type { OpportunitySummary } from "@/server/services/opportunities/list-opportunities";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CurrencyAmount } from "@/components/app/currency-amount";
import { QuestCard } from "@/components/app/quest-card";
import { Separator } from "@/components/ui/separator";
import { capitalize, TERMS } from "@/lib/terms";
import { QuestActions } from "./quest-actions";

export const metadata = { title: "Your quests · Dealio" };

/** What the advocate can do from each status, and nothing else. */
const ACTIONS = {
  REQUESTED: [
    { value: "accept", label: "Accept" },
    { value: "decline", label: "Decline", variant: "outline" },
  ],
  ACCEPTED: [
    { value: "complete", label: "Mark done" },
    { value: "decline", label: "Cannot do this", variant: "outline" },
  ],
} as const;

export default async function AdvocateHome() {
  const identity = await requireIdentity();

  if (identity.advocates.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        description={`You are signed in as ${identity.user.email}, but you have not accepted an invite. Access comes from an invitation — ask your contact to send one.`}
      />
    );
  }

  // One dashboard per business. They stay separate because a balance earned at
  // one company cannot be spent at another, so a combined view would invite
  // exactly the wrong conclusion.
  const dashboards = await Promise.all(
    identity.advocates.map((profile) =>
      getAdvocateDashboard({
        db: prisma,
        actor: advocateActor(identity, profile.businessId),
      }),
    ),
  );

  return (
    <div className="space-y-12">
      {dashboards.map((dashboard) => (
        <BusinessSection key={dashboard.businessId} dashboard={dashboard} />
      ))}
    </div>
  );
}

function BusinessSection({ dashboard }: { dashboard: AdvocateDashboard }) {
  // "Needs you" first, because that is the only reason to open this page. The
  // rest is reassurance that nothing was lost.
  const needsYou = dashboard.opportunities.filter(
    (o) => o.status === "REQUESTED" || o.status === "ACCEPTED",
  );
  const everythingElse = dashboard.opportunities.filter((o) => !needsYou.includes(o));

  return (
    <section className="space-y-6">
      <PageHeader
        title={dashboard.businessName}
        description={`What ${dashboard.businessName} has asked you for, and what you have earned.`}
        action={
          <div className="text-right">
            <CurrencyAmount amount={dashboard.balance} size="large" />
            <p className="text-muted-foreground text-xs">Your balance</p>
          </div>
        }
      />

      {dashboard.opportunities.length === 0 ? (
        <EmptyState
          title={`No ${TERMS.quest.many} yet`}
          description={`When ${dashboard.businessName} asks you for a referral, a reference call or a testimonial, it will appear here.`}
        />
      ) : (
        <>
          {needsYou.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Needs you</h2>
              {needsYou.map((opportunity) => (
                <AdvocateQuest
                  key={opportunity.id}
                  businessId={dashboard.businessId}
                  opportunity={opportunity}
                />
              ))}
            </div>
          )}

          {everythingElse.length > 0 && (
            <div className="space-y-3">
              {needsYou.length > 0 && <Separator />}
              <h2 className="text-muted-foreground text-sm font-medium">
                {needsYou.length > 0 ? "Everything else" : capitalize(TERMS.quest.many)}
              </h2>
              {everythingElse.map((opportunity) => (
                <AdvocateQuest
                  key={opportunity.id}
                  businessId={dashboard.businessId}
                  opportunity={opportunity}
                  quiet
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** A quest plus whichever responses its status allows. */
function AdvocateQuest({
  businessId,
  opportunity,
  quiet,
}: {
  businessId: string;
  opportunity: OpportunitySummary;
  quiet?: boolean;
}) {
  const actions = ACTIONS[opportunity.status as keyof typeof ACTIONS];
  const subtitle =
    [opportunity.prospectName, opportunity.prospectCompany]
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
        actions && (
          <QuestActions
            businessId={businessId}
            opportunityId={opportunity.id}
            options={actions}
          />
        )
      }
    />
  );
}
