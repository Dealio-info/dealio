import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyAmount } from "./currency-amount";
import { CURRENCY } from "@/lib/currency";

/**
 * One reward, as the advocate sees it.
 *
 * States the gap rather than just disabling what they cannot afford: "four
 * more and this is yours" is a reason to do another quest, where a greyed-out
 * card is only a refusal. The whole product runs on that gap being visible.
 */
export function RewardCard({
  name,
  description,
  cost,
  balance,
  action,
}: {
  name: string;
  description?: string | null;
  cost: number;
  balance: number;
  action?: React.ReactNode;
}) {
  const affordable = balance >= cost;
  const shortfall = cost - balance;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle className="text-base">{name}</CardTitle>
        <CurrencyAmount amount={cost} />
      </CardHeader>
      <CardContent className="space-y-3">
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
        <p className="text-muted-foreground text-sm">
          {affordable
            ? "You have enough for this."
            : `${shortfall} more ${shortfall === 1 ? CURRENCY.one : CURRENCY.many} and this is yours.`}
        </p>
        {/*
          `action` stretches to the card's width, because `CardContent` is a
          column. That is wanted here — one card, one thing to do — and is
          noted because elsewhere the same behaviour is a bug worth fixing
          with a nested row.
        */}
        {action}
      </CardContent>
    </Card>
  );
}
