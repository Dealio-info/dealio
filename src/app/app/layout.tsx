import { requireIdentity } from "@/server/auth";
import { NavShell, type NavItem } from "@/components/nav/nav-shell";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { capitalize, TERMS } from "@/lib/terms";

/**
 * The business side: admins and reps.
 *
 * Deliberately a different shell from `/advocate`, not the same one with
 * different links. These are different people — a sales team manages a
 * pipeline, their customers complete requests — and CLAUDE.md asks that the
 * layout always make clear which audience a file serves. The shells are where
 * that stops being a convention and becomes visible.
 *
 * `requireIdentity` here rather than relying on `src/proxy.ts`: the proxy only
 * checks that a session exists and cannot reach the database, so it is a
 * convenience redirect. This is the boundary.
 */
const NAV: readonly NavItem[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/advocates", label: capitalize(TERMS.advocate.many) },
  { href: "/app/quests", label: capitalize(TERMS.quest.many) },
  { href: "/app/rewards", label: capitalize(TERMS.reward.many) },
  { href: "/app/settings", label: "Settings" },
];

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireIdentity();

  return (
    <NavShell items={NAV} home="/app" trailing={<SignOutButton />}>
      {children}
    </NavShell>
  );
}
