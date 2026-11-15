import Link from "next/link";
import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { canPublishOpportunity, soleBusinessActor } from "@/server/context";
import { getApprovalPolicy } from "@/server/services/tenancy/approval-policy";
import { listAdvocates } from "@/server/services/advocates/list-advocates";
import { listOpportunities } from "@/server/services/opportunities/list-opportunities";
import { isTerminal } from "@/server/services/opportunities/transitions";
import { availableVerbs } from "@/server/services/opportunities/business-verbs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { QuestCard } from "@/components/app/quest-card";
import { buttonVariants } from "@/components/ui/button";
import { capitalize, questTypeLabel, TERMS } from "@/lib/terms";
import { formatCents } from "@/lib/money";
import { NewQuest } from "./new-quest-form";
import { QuestControls } from "./quest-controls";

export const metadata = { title: "Quests · Dealio" };

/**
 * Every quest the business has asked for, grouped by whose move it is.
 *
 * "Needs you" is whatever this person can move forward right now — derived
 * from the same `canTransition` the service enforces, so an admin and a rep
 * under a strict policy see different lists, and neither sees a button the
 * server would refuse.
 */
export default async function QuestsPage() {
  const identity = await requireIdentity();
  const actor = soleBusinessActor(identity);
  const ctx = { db: prisma, actor };
  const [policy, advocates, quests] = await Promise.all([
    getApprovalPolicy(ctx),
    listAdvocates(ctx),
    listOpportunities(ctx),
  ]);

  const nameOf = new Map(advocates.map((a) => [a.id, a.name ?? a.email]));
  const askable = advocates
    .filter((a) => a.status !== "INACTIVE")
    .map((a) => ({
      id: a.id,
      label: (a.name ?? a.email) + (a.hasClaimed ? "" : " (invited, not yet joined)"),
    }));

  const rows = quests.map((q) => {
    const verbs = availableVerbs({
      status: q.status,
      actor,
      policy,
      isCreator: q.createdByUserId === actor.userId,
    });
    // Moving it forward needs this person; cancelling alone does not.
    const needsYou = verbs.some((v) => v !== "cancel");
    return { ...q, verbs, needsYou };
  });
  const needsYou = rows.filter((r) => r.needsYou);
  const inFlight = rows.filter((r) => !r.needsYou && !isTerminal(r.status));
  const closed = rows.filter((r) => isTerminal(r.status));

  const card = (q: (typeof rows)[number], quiet = false) => (
    <QuestCard
      key={q.id}
      audience="business"
      quiet={quiet}
      title={q.title}
      subtitle={[
        questTypeLabel(q.type),
        nameOf.get(q.advocateId),
        q.prospectCompany ?? q.prospectName,
        q.influencedRevenueCents !== null
          ? `${formatCents(q.influencedRevenueCents)} influenced`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      status={q.status}
      rewardAmount={q.rewardAmount}
      actions={
        q.verbs.length > 0 ? (
          <QuestControls
            opportunityId={q.id}
            verbs={q.verbs}
            rewardAmount={q.rewardAmount}
          />
        ) : undefined
      }
    />
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={capitalize(TERMS.quest.many)}
        description={`Referrals, reference calls, testimonials, case studies and intros you have asked ${TERMS.advocate.many} for.`}
        action={
          <NewQuest
            advocates={askable}
            canSend={canPublishOpportunity(actor, policy)}
          />
        }
      />

      {askable.length === 0 ? (
        <EmptyState
          title={`Invite an ${TERMS.advocate.one} first`}
          description={`A ${TERMS.quest.one} is always for someone. Once you have invited an ${TERMS.advocate.one}, you can ask them for things here.`}
          action={
            <Link
              href="/app/advocates"
              className={buttonVariants({ variant: "outline" })}
            >
              Go to {TERMS.advocate.many}
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No ${TERMS.quest.many} yet`}
          description={`Ask an ${TERMS.advocate.one} for a referral, a call or a quote. It appears here and moves along as they respond.`}
        />
      ) : (
        <div className="space-y-8">
          <Group title="Needs you" empty="Nothing waiting on you.">
            {needsYou.map((q) => card(q))}
          </Group>
          {inFlight.length > 0 && (
            <Group title={`With ${TERMS.advocate.many}`}>
              {inFlight.map((q) => card(q))}
            </Group>
          )}
          {closed.length > 0 && (
            <Group title="Closed" muted>
              {closed.map((q) => card(q, true))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  empty,
  muted,
  children,
}: {
  title: string;
  empty?: string;
  muted?: boolean;
  children: React.ReactNode[];
}) {
  return (
    <section className="space-y-3">
      <h2
        className={
          muted ? "text-muted-foreground text-sm font-medium" : "text-sm font-medium"
        }
      >
        {title}
        {children.length > 0 && (
          <span className="text-muted-foreground ml-2 font-normal">
            {children.length}
          </span>
        )}
      </h2>
      {children.length === 0 && empty ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}
