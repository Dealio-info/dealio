import { cn } from "@/lib/utils";

/**
 * One number on a dashboard, with its label underneath rather than above.
 *
 * `emphasis` puts the figure in the brand gradient. Use it for the one number
 * a page exists to show — influenced revenue, an advocate's balance — and
 * nowhere else; colour that is everywhere stops meaning anything.
 */
export function Stat({
  label,
  value,
  hint,
  emphasis,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div
        className={cn(
          "text-2xl font-semibold tracking-tight tabular-nums",
          emphasis && "text-brand-gradient",
        )}
      >
        {value}
      </div>
      <div className="text-muted-foreground text-sm">{label}</div>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </div>
  );
}
