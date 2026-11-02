import { cn } from "@/lib/utils";

/** One number on a dashboard, with its label underneath rather than above. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="text-muted-foreground text-sm">{label}</div>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </div>
  );
}
