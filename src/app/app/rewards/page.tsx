import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { capitalize, TERMS } from "@/lib/terms";

export const metadata = { title: "Rewards · Dealio" };

export default function RewardsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title={capitalize(TERMS.reward.many)}
        description={`What your ${TERMS.advocate.many} can spend their balance on, and the redemptions waiting for your approval.`}
      />
      <EmptyState
        title="Not built yet"
        description="The catalog and the redemption approval flow are still to come."
      />
    </div>
  );
}
