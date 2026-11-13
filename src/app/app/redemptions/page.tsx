import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { soleBusinessActor } from "@/server/context";
import { listRedemptions } from "@/server/services/rewards/redemptions";
import { getOutstandingLiability } from "@/server/services/rewards/balance";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { RedemptionRow } from "@/components/app/redemption-row";
import { Stat } from "@/components/app/stat";
import { TERMS } from "@/lib/terms";
import { formatCurrency } from "@/lib/currency";
import { DecisionForm } from "./decision-form";

export const metadata = { title: "Redemptions · Dealio" };

/** Statuses that are over and done with, shown separately from the queue. */
const SETTLED = new Set(["DELIVERED", "REJECTED", "FAILED"]);

export default async function RedemptionsPage() {
  const identity = await requireIdentity();
  const actor = soleBusinessActor(identity);
  const ctx = { db: prisma, actor };

  const [redemptions, liability] = await Promise.all([
    listRedemptions(ctx),
    getOutstandingLiability(ctx),
  ]);

  const waiting = redemptions.filter((r) => r.status === "REQUESTED");
  const inFlight = redemptions.filter(
    (r) => r.status !== "REQUESTED" && !SETTLED.has(r.status),
  );
  const settled = redemptions.filter((r) => SETTLED.has(r.status));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Redemptions"
        description={`Approving one spends your own money — you buy and send the ${TERMS.reward.one}. Dealio never holds funds, so nothing moves until you decide.`}
        action={
          <Stat
            label="Outstanding"
            value={formatCurrency(liability)}
            hint="Earned and not yet redeemed"
          />
        }
      />

      {redemptions.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description={`When an ${TERMS.advocate.one} claims something from your catalog, it waits here for a decision.`}
        />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-medium">
              Waiting on you
              {waiting.length > 0 && (
                <span className="text-muted-foreground ml-2 font-normal">
                  {waiting.length}
                </span>
              )}
            </h2>
            {waiting.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing to decide.</p>
            ) : (
              waiting.map((redemption) => (
                <RedemptionRow
                  key={redemption.id}
                  redemption={redemption}
                  action={
                    <DecisionForm
                      redemptionId={redemption.id}
                      status={redemption.status}
                    />
                  }
                />
              ))
            )}
          </section>

          {inFlight.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">Approved, not yet sent</h2>
              <p className="text-muted-foreground max-w-prose text-sm">
                Already debited. Mark each one sent once you have bought and delivered
                it, so the record matches what happened.
              </p>
              {inFlight.map((redemption) => (
                <RedemptionRow
                  key={redemption.id}
                  redemption={redemption}
                  action={
                    <DecisionForm
                      redemptionId={redemption.id}
                      status={redemption.status}
                    />
                  }
                />
              ))}
            </section>
          )}

          {settled.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-sm font-medium">Done</h2>
              {settled.map((redemption) => (
                <RedemptionRow key={redemption.id} redemption={redemption} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
