import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { capitalize, TERMS } from "@/lib/terms";

export const metadata = { title: "Quests · Dealio" };

export default function QuestsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title={capitalize(TERMS.quest.many)}
        description={`Referrals, reference calls, testimonials, case studies and intros you have asked ${TERMS.advocate.many} for.`}
        action={<Button disabled>New {TERMS.quest.one}</Button>}
      />
      <EmptyState
        title="Not wired up yet"
        description="The lifecycle state machine and every transition behind it are done and tested. This is the pipeline view over them."
      />
    </div>
  );
}
