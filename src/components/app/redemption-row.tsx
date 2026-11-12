import { CurrencyAmount } from "./currency-amount";
import { StatusBadge } from "./status-badge";

export type RedemptionLine = {
  readonly id: string;
  readonly rewardName: string;
  readonly cost: number;
  readonly status: string;
  readonly requestedAt: Date;
  readonly failureReason: string | null;
  readonly advocate: { readonly name: string | null; readonly email: string };
};

/**
 * One redemption, in a list, for either audience.
 *
 * Shared because both sides are looking at the same record and should see the
 * same facts — the business's queue and the advocate's history differ only in
 * the labels (handled by `audience`), whether the advocate is named, and what
 * can be done about it (passed in as `action`). Two components would drift.
 */
export function RedemptionRow({
  redemption,
  audience = "business",
  showAdvocate = true,
  action,
}: {
  redemption: RedemptionLine;
  audience?: "business" | "advocate";
  showAdvocate?: boolean;
  action?: React.ReactNode;
}) {
  const who = redemption.advocate.name ?? redemption.advocate.email;

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium">{redemption.rewardName}</p>
          <p className="text-muted-foreground text-sm">
            {showAdvocate && <>{who} · </>}
            <time dateTime={redemption.requestedAt.toISOString()}>
              {redemption.requestedAt.toLocaleDateString()}
            </time>
          </p>
          {redemption.failureReason && (
            <p className="text-muted-foreground max-w-prose text-sm">
              {redemption.failureReason}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <CurrencyAmount amount={redemption.cost} />
            <StatusBadge
              status={redemption.status}
              audience={audience}
              kind="redemption"
            />
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}
