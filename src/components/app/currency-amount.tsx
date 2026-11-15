import { cn } from "@/lib/utils";
import { CURRENCY, formatCurrency } from "@/lib/currency";

/**
 * A currency amount, pluralised and never hardcoded.
 *
 * The name is still a placeholder, so it comes from `currency.ts` every time —
 * including the abbreviated form, which shows the unit rather than inventing a
 * symbol we might not want.
 */
export function CurrencyAmount({
  amount,
  size = "default",
  className,
}: {
  amount: number;
  size?: "default" | "large";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        size === "large" ? "text-3xl font-bold tracking-tight" : "font-medium",
        className,
      )}
      // Spelled out for anyone not reading the number visually.
      aria-label={formatCurrency(amount)}
    >
      {/*
        The large size is a balance — the number an advocate came to see — so
        the figure carries the brand gradient. On the figure alone: gradient
        text works by making the fill transparent, which children inherit, so
        on the outer span it would make the unit label below invisible.
      */}
      <span className={size === "large" ? "text-brand-gradient" : undefined}>
        {amount.toLocaleString()}
      </span>
      <span className="text-muted-foreground ml-1 text-sm font-normal">
        {amount === 1 ? CURRENCY.one : CURRENCY.many}
      </span>
    </span>
  );
}
