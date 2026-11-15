import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { advocateActor } from "@/server/context";
import { getAdvocateDashboard } from "@/server/services/advocates/advocate-dashboard";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CurrencyAmount } from "@/components/app/currency-amount";
import { RewardCard } from "@/components/app/reward-card";
import { RedemptionRow } from "@/components/app/redemption-row";
import { TERMS } from "@/lib/terms";
import { CURRENCY } from "@/lib/currency";
import { ClaimButton } from "./claim-button";

export const metadata = { title: "Rewards · Dealio" };

/**
 * The full catalog and claim history, per business.
 *
 * Reads the same `getAdvocateDashboard` as the home page, so the two cannot
 * disagree about a balance or what is free to spend.
 */
export default async function AdvocateRewardsPage() {
  const identity = await requireIdentity();

  if (identity.advocates.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        description="You have not accepted an invite, so there is no catalog to show."
      />
    );
  }

  const catalogs = await Promise.all(
    identity.advocates.map((profile) =>
      getAdvocateDashboard({
        db: prisma,
        actor: advocateActor(identity, profile.businessId),
      }),
    ),
  );

  return (
    <div className="space-y-12">
      {catalogs.map((catalog) => (
        <section key={catalog.businessId} className="space-y-6">
          <PageHeader
            title={`${catalog.businessName} ${TERMS.reward.many}`}
            description={`What you can claim with the ${CURRENCY.many} you have earned.`}
            action={
              <div className="text-right">
                <CurrencyAmount amount={catalog.balance} size="large" />
                <p className="text-muted-foreground text-xs">Your balance</p>
                {catalog.available !== catalog.balance && (
                  <p className="text-muted-foreground text-xs">
                    {catalog.available} free — the rest is on requests waiting for a
                    decision
                  </p>
                )}
              </div>
            }
          />

          {catalog.rewards.length === 0 ? (
            <EmptyState
              title={`No ${TERMS.reward.many} yet`}
              description={`${catalog.businessName} has not added anything to claim. Your balance keeps until they do.`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.rewards.map((reward) => (
                <RewardCard
                  key={reward.id}
                  name={reward.name}
                  description={reward.description}
                  cost={reward.cost}
                  // The gap shown is against what is free, matching the
                  // button: currency held for a pending claim is not spendable.
                  balance={catalog.available}
                  action={
                    <ClaimButton
                      businessId={catalog.businessId}
                      rewardId={reward.id}
                      affordable={catalog.available >= reward.cost}
                    />
                  }
                />
              ))}
            </div>
          )}

          {catalog.redemptions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">What you have claimed</h2>
              {catalog.redemptions.map((redemption) => (
                <RedemptionRow
                  key={redemption.id}
                  redemption={redemption}
                  audience="advocate"
                  showAdvocate={false}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
