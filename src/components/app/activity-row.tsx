import type { LedgerReason } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { CURRENCY } from "@/lib/currency";
import { capitalize, TERMS } from "@/lib/terms";

export type ActivityItem = {
  readonly id: string;
  readonly delta: number;
  readonly reason: LedgerReason;
  readonly createdAt: Date;
  readonly label: string | null;
};

/**
 * What each kind of movement is called when there is nothing more specific to
 * say. Exhaustive over `LedgerReason`, so a new reason fails to compile until
 * someone decides how to describe it to an advocate.
 */
const FALLBACK: Record<LedgerReason, (business: string) => string> = {
  OPPORTUNITY_REWARD: () => `${capitalize(TERMS.quest.one)} completed`,
  REDEMPTION: () => capitalize(TERMS.reward.one),
  FULFILLMENT_FAILED: () => `Refund: ${TERMS.reward.one} could not be sent`,
  MANUAL_ADJUSTMENT: (business) => `Adjustment by ${business}`,
  EXPIRY: () => `${capitalize(CURRENCY.many)} expired`,
};

/**
 * One movement of an advocate's currency: what it was for, when, and how much.
 *
 * The amount is signed and always shown with its sign — "+20", "−5" — because
 * an unsigned number in a history reads as a credit. The minus is a real minus
 * sign, not a hyphen, so it does not wrap or read as a dash.
 */
export function ActivityRow({
  item,
  businessName,
}: {
  item: ActivityItem;
  businessName: string;
}) {
  const refund = item.reason === "FULFILLMENT_FAILED";
  const label =
    refund && item.label
      ? `Refund: ${item.label} could not be sent`
      : (item.label ?? FALLBACK[item.reason](businessName));
  const sign = item.delta > 0 ? "+" : "−";

  return (
    <li className="flex items-baseline justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm">{label}</p>
        <time
          dateTime={item.createdAt.toISOString()}
          className="text-muted-foreground text-xs"
        >
          {item.createdAt.toLocaleDateString()}
        </time>
      </div>
      <span
        className={cn(
          "shrink-0 text-sm font-medium tabular-nums",
          item.delta < 0 && "text-muted-foreground",
        )}
        aria-label={`${item.delta > 0 ? "plus" : "minus"} ${Math.abs(item.delta)} ${
          Math.abs(item.delta) === 1 ? CURRENCY.one : CURRENCY.many
        }`}
      >
        {sign}
        {Math.abs(item.delta).toLocaleString()}
      </span>
    </li>
  );
}
