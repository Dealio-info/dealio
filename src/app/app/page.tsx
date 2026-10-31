import { requireIdentity } from "@/server/auth";

export const metadata = { title: "Dealio" };

/**
 * The business side. A placeholder for now: it proves the session reaches a
 * domain identity, and shows what that identity actually grants.
 *
 * Note it does not assume a single "current" business. A person can be staff at
 * more than one, so the business is chosen explicitly — picking one implicitly
 * is the cross-tenant bug this design avoids.
 */
export default async function AppHome() {
  const identity = await requireIdentity();

  if (identity.memberships.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-24">
        <h1 className="text-2xl font-semibold">No business yet</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          You are signed in as {identity.user.email}, but you are not a member of any
          business. Access comes from being invited — signing up does not grant it.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-24">
      <h1 className="text-2xl font-semibold">Signed in</h1>
      <p className="text-muted-foreground mt-2 text-sm">{identity.user.email}</p>
      <ul className="mt-6 space-y-1 text-sm">
        {identity.memberships.map((m) => (
          <li key={m.businessId}>
            <code>{m.businessId}</code> — {m.role}
          </li>
        ))}
      </ul>
    </main>
  );
}
