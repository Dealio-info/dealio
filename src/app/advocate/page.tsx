import { requireIdentity } from "@/server/auth";
import { formatCurrency } from "@/lib/currency";

export const metadata = { title: "Your rewards · Dealio" };

/** The advocate side. Placeholder; the real dashboard is a later task. */
export default async function AdvocateHome() {
  const identity = await requireIdentity();

  if (identity.advocates.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-24">
        <h1 className="text-2xl font-semibold">Nothing here yet</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          You are signed in as {identity.user.email}, but you have not accepted an
          invite to be an advocate. Ask your contact to send one.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-24">
      <h1 className="text-2xl font-semibold">Your rewards</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {/* Balances arrive with the ledger service; {formatCurrency} keeps the
            currency name in one place. */}
        Balance: {formatCurrency(0)}
      </p>
    </main>
  );
}
