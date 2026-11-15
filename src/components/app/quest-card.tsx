import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import { CurrencyAmount } from "./currency-amount";

/**
 * One request, for either audience.
 *
 * Presentational, with `actions` passed in — the real page passes a form bound
 * to a server action, the style guide passes plain buttons. Shared so the two
 * cannot drift: the guide's own copy of this markup had already diverged, and
 * a style guide that shows something the app does not render is worse than no
 * style guide.
 *
 * The reward sits next to the ask rather than below it, because "what is this
 * worth" is the question being weighed, not a footnote to it.
 */
export function QuestCard({
  title,
  subtitle,
  status,
  rewardAmount,
  actions,
  quiet,
  audience = "advocate",
}: {
  title: string;
  subtitle?: string | undefined;
  status: string;
  rewardAmount: number;
  actions?: React.ReactNode;
  /** Done and dusted: present, but not competing for attention. */
  quiet?: boolean;
  /** Whose words the status is in — a rep's "Sent" is an advocate's "New". */
  audience?: "business" | "advocate";
}) {
  return (
    <Card className={quiet ? "bg-transparent" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusBadge status={status} audience={audience} />
          <CurrencyAmount amount={rewardAmount} />
        </div>
      </CardHeader>
      {actions && <CardContent>{actions}</CardContent>}
    </Card>
  );
}
