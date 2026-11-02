import { cn } from "@/lib/utils";

/**
 * Renders the same thing twice, light and dark, side by side.
 *
 * There is no theme toggle in the app: the palette is not decided, and shipping
 * a user-facing switcher would double the surface to review for an MVP that may
 * not want one. But the `.dark` tokens exist and leaving them unexercised is
 * how they rot — so the gallery applies `.dark` to a container instead, which
 * is all the class ever does.
 */
export function ThemePair({
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
      <div className="grid gap-px overflow-hidden rounded-lg border md:grid-cols-2">
        <Pane>{children}</Pane>
        <Pane dark>{children}</Pane>
      </div>
    </section>
  );
}

function Pane({ dark, children }: { dark?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "bg-background text-foreground space-y-4 p-5",
        dark && "dark border-l",
      )}
    >
      <p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
        {dark ? "Dark" : "Light"}
      </p>
      {children}
    </div>
  );
}
