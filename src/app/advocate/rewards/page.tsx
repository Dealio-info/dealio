import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { capitalize, TERMS } from "@/lib/terms";

export const metadata = { title: "Rewards · Dealio" };

export default function AdvocateRewardsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title={capitalize(TERMS.reward.many)}
        description="What you can claim with what you have earned."
      />
      <EmptyState
        title="Nothing to claim yet"
        description="Your company has not added any rewards. Once they do, they will show up here."
      />
    </div>
  );
}
