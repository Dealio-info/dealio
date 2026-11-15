import { cn } from "@/lib/utils";

/**
 * The Dealio mark: two chevrons, lime over teal, from the prototype's logo.
 *
 * Drawn inline rather than loaded as an image, so it is crisp at any size and
 * its colours are the brand tokens — when the palette changes, the logo moves
 * with it. Decorative: the wordmark beside it, or the caller's label, is what
 * a screen reader announces.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-6 shrink-0", className)}
    >
      <path
        d="M8 19L20 9L32 19"
        className="stroke-brand-lime"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 29L20 19L32 29"
        className="stroke-brand-teal"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark and wordmark together, as everywhere the product names itself. */
export function Logo({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "large";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-bold tracking-tight",
        size === "large" ? "gap-3 text-3xl" : "gap-2 text-lg",
        className,
      )}
    >
      <LogoMark className={size === "large" ? "size-10" : "size-6"} />
      Dealio
    </span>
  );
}
