"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * `href` borrows Link's own type rather than using `string`. Next 16 checks
 * route literals, so a typo in a nav link is a build error instead of a 404
 * someone finds later.
 */
export type NavItem = {
  readonly href: React.ComponentProps<typeof Link>["href"];
  readonly label: string;
};

/**
 * The shared chrome behind both shells: a sticky header, a nav row, and the
 * page beneath it at a consistent width.
 *
 * The two audiences get visibly different headers rather than one header with
 * different links, because the question "which side of the product am I
 * looking at" should never need a second look. `badge` is what distinguishes
 * them.
 */
export function NavShell({
  items,
  badge,
  trailing,
  children,
}: {
  items: readonly NavItem[];
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Dealio
          </Link>
          {badge}
          <nav
            aria-label="Main"
            className="ml-auto flex items-center gap-1 overflow-x-auto"
          >
            {items.map((item) => {
              const href = String(item.href);
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {trailing}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
