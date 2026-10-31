# The prototype, and why this is a rebuild

The first version of Dealio lives at
[`Dealio-info/dealio-referrals`](https://github.com/Dealio-info/dealio-referrals) — a
Lovable-generated Vite + React app on Supabase, with the browser talking to Postgres directly
through PostgREST. It proved the idea and is still running for a small pilot.

**The detailed record lives in that repo, not here.** Its `README.md` ("Known gaps", "What is
worth copying") and its `CLAUDE.md` ("Known defects") carry the full assessment, with file and
migration references, next to the code they describe. Duplicating it here would only let the two
copies drift. This file records the conclusions this repo needs to stand on its own.

## Why rebuild rather than repair

The prototype has six verified defects. All six come from one root cause: **the browser had
direct database access.** Fixing them in place means re-auditing every policy and every client
write path, and leaves the capability that produced them intact. Removing the capability instead
is a smaller, more durable change — but it is a different application.

The three that mattered most:

1. **Advocates could set their own reward balance.** A row-level security policy granted an
   advocate `UPDATE` on their own record, and Postgres RLS cannot restrict _which columns_ an
   update touches. Combined with an affordability check that ran in the browser, an advocate could
   have awarded themselves the top-tier prize. Real money: the catalog ran to a $500 reward.
2. **Dealio staff and customer business admins shared one permission flag**, so any customer held
   the same global admin role that gated the internal portal and several shared tables.
3. **Balances were a mutable column with no ledger**, so nothing could be reconciled or audited,
   and outstanding reward liability — a metric the brief asks for — was not computable at all.

Worth noting honestly: the _award_ path was later hardened with a compare-and-swap, which did
genuinely fix a lost-update race. The redemption path never got the same treatment, and the RLS
policy made the UI guard moot regardless. One path hardened while the underlying capability
remains is itself the argument for rebuilding.

## How this repo answers each one

| Prototype defect                       | Rebuild                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Browser could write the database       | Prisma importable only from `src/server/db.ts` and `src/server/services/**`, enforced by ESLint. The browser calls service functions |
| Balance editable by its owner          | Balance is derived from an append-only ledger. No service exposes a ledger update or delete                                          |
| Affordability checked client-side      | Checked server-side inside the transaction, against the re-read balance                                                              |
| Non-atomic, racy redemption            | One transaction, with the advocate row locked                                                                                        |
| Staff and customer admin shared a flag | `PlatformStaff` is a separate table, never a role value                                                                              |
| Global email matching on invite claim  | `Advocate` unique on `(businessId, email)`; claiming requires a token                                                                |

## What the prototype is still good for

- **Product flows.** How business users, advocates, opportunities and rewards connect end to end.
- **UI and layout.** Dashboards, KPI and funnel views, the advocate marketplace, landing copy.
- **Domain shape.** A real starting point for the entities this schema needs.
- **The email subsystem**, its most mature part. Read the current design rather than the older
  queue-based one it replaced, and carry over two conventions: callers pass **record IDs** rather
  than arbitrary recipients or templates, which preserves tenant isolation, and outcome handlers
  use **deterministic event IDs** so retries are safe.
- **Its March 2026 tenancy rework** (`team_members` + `business_id` with helper functions) is a
  correct multi-tenant design and worth reading before modeling this schema.

## Reading it safely

Its `CLAUDE.md` and `AGENTS.md` are instructions for _that_ codebase — preserve Lovable
compatibility, keep `lovable-tagger`, use React Router, put schema changes in
`supabase/migrations/`. All wrong here. Don't copy them and don't follow them.

And take its own warning seriously: _"a screen existing in this repo does not mean the feature
behind it is complete."_ Confirm behaviour in the code before carrying anything forward.
