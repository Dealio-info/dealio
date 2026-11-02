/**
 * A titled section of the style guide.
 *
 * This used to render everything twice, light and dark side by side, because
 * there was no way to switch themes. There is now, and the pairs had to go: a
 * nested "light" pane cannot escape an ancestor `.dark` — the dark variant is
 * defined as `&:is(.dark *)` — so with the page in dark mode both panes went
 * dark and the left one lied about which theme it was showing.
 *
 * Rendering once and letting the real toggle drive it is both simpler and
 * honest: what you see here is exactly what the app renders.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
        )}
      </div>
      <div className="bg-card space-y-4 rounded-lg border p-5">{children}</div>
    </section>
  );
}
