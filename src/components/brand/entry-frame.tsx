import Link from "next/link";
import { Logo } from "./logo";

/**
 * The frame for pages people arrive at from outside the app — sign-in, an
 * invite link, an unsubscribe link. Logo, the hero's light, and the content
 * centred. One component so the three cannot drift apart, and because these
 * are the first screens most advocates ever see.
 */
export function EntryFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-hero flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-16">
      <Link href="/" aria-label="Dealio home" className="rounded-md">
        <Logo size="large" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
