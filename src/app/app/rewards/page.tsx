import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { soleBusinessActor } from "@/server/context";
import { listRewards } from "@/server/services/rewards/catalog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { capitalize, TERMS } from "@/lib/terms";
import { CURRENCY } from "@/lib/currency";
import { AddReward } from "./reward-form";
import { RewardRow } from "./reward-row";

export const metadata = { title: "Rewards · Dealio" };

export default async function RewardsPage() {
  const identity = await requireIdentity();
  const actor = soleBusinessActor(identity);
  const rewards = await listRewards({ db: prisma, actor }, { includeInactive: true });

  const live = rewards.filter((r) => r.isActive);
  const withdrawn = rewards.filter((r) => !r.isActive);

  return (
    <div className="space-y-8">
      <PageHeader
        title={capitalize(TERMS.reward.many)}
        description={`What your ${TERMS.advocate.many} can claim with the ${CURRENCY.many} they earn. You fund and fulfil these, so the catalog is yours alone.`}
        action={<AddReward />}
      />

      {rewards.length === 0 ? (
        <EmptyState
          title="No rewards yet"
          description={`Add something worth earning. Until there is at least one, your ${TERMS.advocate.many} have nothing to spend on.`}
        />
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            {live.map((reward) => (
              <RewardRow key={reward.id} reward={reward} />
            ))}
            {live.length === 0 && (
              <EmptyState
                title="Nothing on offer"
                description="Every reward has been withdrawn, so the catalog is empty for advocates."
              />
            )}
          </div>

          {withdrawn.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-muted-foreground text-sm font-medium">Withdrawn</h2>
              <p className="text-muted-foreground max-w-prose text-sm">
                Not on offer any more. Kept because past redemptions point at them, and
                so you can put one back.
              </p>
              {withdrawn.map((reward) => (
                <RewardRow key={reward.id} reward={reward} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
