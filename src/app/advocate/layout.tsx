import { requireIdentity } from "@/server/auth";
import { NavShell, type NavItem } from "@/components/nav/nav-shell";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { capitalize, TERMS } from "@/lib/terms";

/**
 * The advocate side: a company's own customers.
 *
 * Fewer places to go, on purpose. An advocate signs in rarely and for one
 * reason — see what has been asked of them, and spend what they have earned —
 * so anything resembling a CRM would be noise. The "Advocate" marker in the
 * header is there because one person can legitimately be a rep at one business
 * and an advocate of another, and they should never have to wonder which they
 * are currently looking at.
 */
const NAV: readonly NavItem[] = [
  { href: "/advocate", label: capitalize(TERMS.quest.many) },
  { href: "/advocate/rewards", label: capitalize(TERMS.reward.many) },
];

export default async function AdvocateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireIdentity();

  return (
    <NavShell
      items={NAV}
      badge={
        <span className="text-muted-foreground border-border rounded-full border px-2 py-0.5 text-xs">
          {capitalize(TERMS.advocate.one)}
        </span>
      }
      trailing={<SignOutButton />}
    >
      {children}
    </NavShell>
  );
}
