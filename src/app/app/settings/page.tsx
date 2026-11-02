import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { TERMS } from "@/lib/terms";

export const metadata = { title: "Settings · Dealio" };

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description={`Whether your reps can send ${TERMS.quest.many} and award ${TERMS.reward.many} themselves, or whether an admin signs off first.`}
      />
      <EmptyState
        title="Not wired up yet"
        description="Reading and changing the approval policy is done in the service layer and admin-only. This is the form over it."
      />
    </div>
  );
}
