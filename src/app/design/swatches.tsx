/**
 * Every colour the interface is allowed to use, by the name it is used under.
 *
 * Listed by role rather than by hue because that is how the code refers to
 * them, and because it is the list the palette decision has to answer. Anything
 * not here is a literal colour, which ESLint rejects in markup.
 */
const SEMANTIC = [
  ["background", "bg-background"],
  ["foreground", "bg-foreground"],
  ["card", "bg-card"],
  ["primary", "bg-primary"],
  ["secondary", "bg-secondary"],
  ["muted", "bg-muted"],
  ["accent", "bg-accent"],
  ["destructive", "bg-destructive"],
  ["border", "bg-border"],
  ["input", "bg-input"],
  ["ring", "bg-ring"],
] as const;

const BRAND = [
  ["brand-ink", "bg-brand-ink"],
  ["brand-green", "bg-brand-green"],
  ["brand-paper", "bg-brand-paper"],
] as const;

const STATUS = [
  ["status-waiting", "bg-status-waiting"],
  ["status-active", "bg-status-active"],
  ["status-done", "bg-status-done"],
  ["status-success", "bg-status-success"],
  ["status-failed", "bg-status-failed"],
] as const;

function Row({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(([name, bg]) => (
        <div key={name} className="space-y-1">
          <div className={`size-12 rounded-md border ${bg}`} />
          <code className="text-muted-foreground block text-[10px]">{name}</code>
        </div>
      ))}
    </div>
  );
}

export function SemanticSwatches() {
  return <Row items={SEMANTIC} />;
}

export function BrandSwatches() {
  return <Row items={BRAND} />;
}

export function StatusSwatches() {
  return <Row items={STATUS} />;
}
