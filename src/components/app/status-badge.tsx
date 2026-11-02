import { cn } from "@/lib/utils";
import { statusLabel, statusRole } from "@/lib/terms";

/**
 * A lifecycle status, labelled and colour-coded consistently everywhere.
 *
 * Both audiences use this, with `audience` choosing the wording — a rep's
 * "Sent" is an advocate's "New". The colour comes from a `status-*` role token,
 * which is currently neutral on purpose: the palette is pending, and the point
 * of routing through a token is that giving these hue later is one edit to
 * `globals.css` rather than a hunt through components.
 */
const ROLE_CLASSES = {
  waiting: "border-status-waiting/30 text-status-waiting bg-status-waiting/8",
  active: "border-status-active/30 text-status-active bg-status-active/8",
  done: "border-status-done/30 text-status-done bg-status-done/8",
  success: "border-status-success/40 text-status-success bg-status-success/10",
  failed: "border-status-failed/30 text-status-failed bg-status-failed/8",
} as const;

export function StatusBadge({
  status,
  audience = "business",
  className,
}: {
  status: string;
  audience?: "business" | "advocate";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        ROLE_CLASSES[statusRole(status)],
        className,
      )}
    >
      {statusLabel(status, audience)}
    </span>
  );
}
