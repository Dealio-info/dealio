import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { advocateActor } from "@/server/context";
import { listRewards } from "@/server/services/rewards/catalog";
import { getBalance } from "@/server/services/rewards/balance";
import {
  getAvailableBalance,
  listRedemptions,
} from "@/server/services/rewards/redemptions";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CurrencyAmount } from "@/components/app/currency-amount";
import { RewardCard } from "@/components/app/reward-card";
import { RedemptionRow } from "@/components/app/redemption-row";
import { ClaimButton } from "./claim-button";
import { TERMS } from "@/lib/terms";
import { CURRENCY } from "@/lib/currency";

export const metadata = { title: "Rewards · Dealio" };

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

  // One catalog per business, like the quests. Each company funds its own
  // rewards, and a balance earned at one cannot be spent at another.
  const catalogs = await Promise.all(
    identity.advocates.map(async (profile) => {
      const actor = advocateActor(identity, profile.businessId);
      const ctx = { db: prisma, actor };
      const [business, rewards, balance, available, redemptions] = await Promise.all([
        prisma.business.findUniqueOrThrow({
          where: { id: profile.businessId },
          select: { name: true },
        }),
        listRewards(ctx),
        getBalance(ctx, { advocateId: profile.advocateId }),
        getAvailableBalance(ctx, { advocateId: profile.advocateId }),
        listRedemptions(ctx),
      ]);
      return {
        businessId: profile.businessId,
        name: business.name,
        rewards,
        balance,
        available,
        redemptions,
      };
    }),
  );

  return (
    <div className="space-y-12">
      {catalogs.map((catalog) => (
        <section key={catalog.businessId} className="space-y-6">
          <PageHeader
            title={`${catalog.name} ${TERMS.reward.many}`}
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
              description={`${catalog.name} has not added anything to claim. Your balance keeps until they do.`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.rewards.map((reward) => (
                <RewardCard
                  key={reward.id}
                  name={reward.name}
                  description={reward.description}
                  cost={reward.cost}
                  balance={catalog.balance}
                  action={
                    <ClaimButton
                      businessId={catalog.businessId}
                      rewardId={reward.id}
                      // Measured against what is *free*, not the headline
                      // balance: currency already committed to a pending
                      // request cannot be spent twice, and the server would
                      // refuse it anyway.
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
