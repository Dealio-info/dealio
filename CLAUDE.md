# Dealio — agent context

## What this is

The ground-up rebuild of Dealio, a customer advocacy platform for B2B SaaS sales teams. Reps
post advocacy opportunities; the company's customers ("advocates") complete them, earn a virtual
currency, and redeem it for rewards fulfilled through the Tremendous API.

Two audiences: the **business side** (business admins and reps) and the **advocates**. They are
different people with different permissions, and the layout should always make clear which one a
file serves.

## The one rule that matters

**The browser never touches the database.**

The Prisma client is importable only from `src/server/db.ts` and `src/server/services/**` —
that covers the generated client in `src/generated/prisma`, the `@prisma/client` package and the
`@prisma/adapter-pg` driver adapter. Enforced by `@typescript-eslint/no-restricted-imports` in
`eslint.config.mjs`, not by convention, and covered by tests in
`src/server/boundary.test.ts` rather than checked by hand. Pages, components, route handlers and
server actions call a service function instead.

**Type-only imports are exempt.** `import type { OpportunityStatus } from "@/generated/prisma/enums"`
is fine anywhere: types are erased at compile time, cannot reach the database, and sharing them
stops those unions being hand-duplicated and drifting from the schema. A _value_ import of the same
module is still blocked — Prisma generates a runtime const beside each enum type, and that is where
the line sits.

Multi-tenant isolation is enforced in the service layer rather than by row-level security. That
choice is only sound while this rule holds, so **do not relax the lint rule to unblock a
feature** — add a service function instead. If you ever find yourself wanting Prisma in a
component, that is the signal a service function is missing.

The prototype enforced tenancy with RLS _and_ gave the browser direct database access through
PostgREST. Every cross-tenant and currency defect it has follows from that. See
`docs/prototype-assessment.md`.

## Invariants

1. **Currency moves only through the ledger.** `LedgerEntry` is append-only: no service may
   expose an update or delete against it. An advocate's balance is `SUM(delta)`, never a stored
   column. There are exactly two places currency moves — a credit when an opportunity reaches
   `REWARDED`, and a debit when a redemption is `APPROVED` — and both happen inside a single
   transaction that writes the ledger row. Credits are idempotent on `opportunityId`.
2. **Affordability is checked server-side, inside the transaction.** Re-read the derived balance
   and reject if insufficient. Never trust a balance the client sent.
3. **Lifecycle transitions go through the state machine.** `canTransition` is pure and
   exhaustively tested; every mutation uses it, and every transition writes an
   `OpportunityEvent`.
4. **The approval policy is read from the `Business` row, never from the request.** Whether a rep
   may publish an opportunity or award currency themselves is a per-business setting. A caller
   must not be able to widen their own authority with any input.
5. **Every tenant-scoped record carries `businessId`.** Only `User` and `PlatformStaff` are
   global.
6. **Platform staff is a separate table, not a role value.** Dealio staff and customer business
   admins must never share a flag — conflating them was the prototype's worst defect.

## Roles

Four exist in the model: `PLATFORM_STAFF` (Dealio, via its own table), `BUSINESS_ADMIN`, `REP`,
and advocate (via the `Advocate` record, not `Membership`). Only business admin and advocate get
UI in the MVP; platform staff onboards businesses with a seed script.

## Conventions

- **Tests first.** Write the failing test, then the implementation. Unit tests for pure logic and
  service rules; integration tests against a real throwaway Postgres for anything touching the
  database. The rules worth testing hardest are permissions, lifecycle transitions and currency.
- **UI components are shadcn/ui**, in `src/components/ui/`. Add them with
  `npx shadcn@latest add <name>` rather than hand-writing them; once added they are ordinary
  project files you may edit. The CLI emits unformatted code, so run `npm run format` after
  adding one or `format:check` will fail in CI.
- **Class merging** uses `cn` — import from `cn` directly (as the generated components do) or via
  the `@/lib/utils` alias. It replaces `clsx` + `tailwind-merge`; don't add those back.
- **Use shadcn's semantic tokens** (`bg-background`, `text-foreground`, `bg-primary`) for UI
  chrome, and the `brand-` tokens in `globals.css` (`bg-brand-green`) for brand surfaces. Never
  declare an un-namespaced `--color-*` that shadcn also defines — its `@theme inline` block comes
  later in the file and will silently win.
- **Dark mode is class-based** (`.dark`, via `@custom-variant dark`). Do not add
  `prefers-color-scheme` rules; they compete with it. And keep `body` colors inside
  `@layer base` — an unlayered `body` rule overrides layered ones and breaks shadcn theming.
- **Currency name** lives only in `src/lib/currency.ts`. Never hardcode "coin" anywhere else —
  the name is not final.
- **User-facing nouns** live only in `src/lib/terms.ts`, for the same reason. The domain keeps its
  own names — the model is `Opportunity`, the table is `opportunities`, the enum is
  `OpportunityStatus` — while the product calls that thing a **quest**. Use the domain name in
  code and `TERMS` for anything a person reads: headings, buttons, emails, toasts, empty states.
  Never hardcode "quest" in a component or template. Do not rename the domain to match the copy:
  the copy has already moved once and the schema should not follow it.
- **Money and currency amounts are integers.** No floats.
- **Service signature** is `fn(ctx: ServiceContext, input)`, where `ServiceContext` is
  `{ db, actor }` from `src/server/context.ts`. The database handle is explicit, not the `prisma`
  singleton, so a service can be composed into a caller's transaction —
  `prisma.$transaction((tx) => doThing({ db: tx, actor }, input))`. Invariant 1 depends on that: a
  currency movement and the ledger row recording it must be atomic. `actor` is a `TenantContext`,
  so it always carries a `businessId`; scope every query by `actor.businessId` and never take a
  business id from the caller's input.
- **Authority decisions live in `src/server/context.ts`** and are pure: `assertBusinessAdmin`,
  `assertSameBusiness`, `canPublishOpportunity`, `canRewardOpportunity`. Use them rather than
  re-deriving a role check. `ApprovalPolicy` is branded so the only way to obtain one is
  `approvalPolicyFromBusiness(business)` — which is how invariant 4 stays honest.
- **Identity is a set, not a single actor.** `resolveIdentity` returns every business a user is
  staff of or an advocate for; the caller names the business it means via `businessActor` /
  `advocateActor`, or uses `soleTenantContext`, which refuses rather than guessing when the user
  belongs to more than one. Never collapse that to a "current" business implicitly.
- **Validate at the boundary** with Zod in the route handler or server action; services may then
  trust their inputs' shape, though never their authority.
- **Schema changes** are Prisma migrations, committed. Never edit an applied migration.
- **Never commit `.env`.** Use `.env.example` for new variables. Anything prefixed
  `NEXT_PUBLIC_` is visible in the browser — service-role keys never are.
- Check the code before claiming a feature exists. Don't report work as done that isn't.

## Do not carry over from the prototype

`dealio-referrals` has its own `CLAUDE.md` and `AGENTS.md`. They are correct for that repo and
wrong here — they instruct an agent to preserve Lovable compatibility, keep `lovable-tagger`, use
Vite and React Router, and put schema changes in `supabase/migrations/`. Don't copy them, and
don't follow them if you are reading that repo for reference.

What _is_ worth taking from it: product flows, UI and layout ideas, the shape of the domain, and
two email conventions — callers pass record IDs rather than arbitrary recipients or templates,
and outcome handlers use deterministic event IDs so retries are safe.

## Current state

Next.js 16 + React 19 + TypeScript + Tailwind 4, shadcn/ui on Base UI, Vitest 5, ESLint 9 (flat
config) with the database boundary, and Prisma 7 with the full domain schema migrated.

**Through Task 7.** The `opportunities` module: `createOpportunity`, `transitionOpportunity`,
`listOpportunities`/`getOpportunity`, and the lifecycle state machine in `transitions.ts`. Every
legal edge and its guard live in one table there; an edge absent from it does not exist, and
`transitions.test.ts` checks all 8 × 8 × 6 × 2 combinations against a spec written out
independently, so adding an edge to the implementation fails the test until it is added to the spec
too.

⚠️ **`VERIFIED → REWARDED` moves no currency yet.** Crediting the ledger inside that same
transaction is Task 8. Until it lands, an opportunity can read `REWARDED` while the advocate's
balance is zero — so nothing should treat the status as evidence of payment. The balance is
`SUM(LedgerEntry.delta)`, always.

**Through Task 6.** Task 6 added the `advocates` module — `inviteAdvocate`, `claimInvite`,
`listAdvocates` — with hashed single-use invite tokens. `claimInvite` takes a `Db` and a `userId`
rather than a `ServiceContext`, because the person claiming has no tenant context yet; the invite is
what gives them one. **Claiming requires the token and nothing else** — no email fallback, ever.

**Through Task 5.** Task 5 added the `tenancy` service module — `createBusiness`, `addMember`,
`listMembers`, `getApprovalPolicy`/`updateApprovalPolicy`, `grantPlatformStaff` and
`resolvePlatformStaffActor` — plus `scripts/grant-platform-staff.ts` and
`scripts/seed-business.ts`. The one part not covered by tests is `provisionAuthUser`, which calls
Supabase's admin API; it has not been run against a live project yet.

**Through Task 4, and now exercised against a live project.** Schema, tenant context, authority
helpers, the database-import boundary, and Supabase auth wiring are all in place:
`src/server/auth.ts` bridges a session to a domain `Identity`, `src/proxy.ts` refreshes the session
and gates `/app` and `/advocate`, `/auth/callback` exchanges the code, and `/sign-in` offers magic
link, password and Google.

Confirmed by hand against the real Supabase project, end to end: the onboarding scripts provision
an auth user, a link they mint signs that person in, and `/app` renders the `BUSINESS_ADMIN`
membership the seed script created. So `resolveIdentity` is verified against live data and not only
against the test Postgres.

`/app` and `/advocate` are deliberately placeholders that render the resolved `Identity` and nothing
else. That makes them the cheapest check that the whole chain holds, and the first thing to open
when auth misbehaves: "No business yet" on `/app` means the session resolved but the membership did
not.

Two things to know about auth:

- Use `getUser()`, never `getSession()`, for any authorization decision. `getSession()` trusts the
  cookie; `getUser()` validates the token with Supabase.
- `src/proxy.ts` checks only "is there a session". It deliberately does **not** check roles, because
  that needs the database and it must stay free of Prisma. It is a convenience redirect, not a
  security boundary — the service layer is the boundary. It is named `proxy`, not `middleware`:
  Next 16 renamed the convention and the old name warns on every build. Same behaviour, same
  `config.matcher`, and the exported function is `proxy` too.

**Scripts run under `tsx --conditions=react-server`.** `server-only` resolves to its real module —
which throws — under node's default conditions, and to an empty one under `react-server`, which is
what Next sets for server components. Any script importing `@/server/db` dies on import without the
flag. Both `npm run grant:staff` and `npm run seed:business` set it; copy it for any new script.

Scripts are **not** on the database-boundary allowlist, deliberately. They reach the database
through `@/server/db` and the service layer like any other caller, so there is exactly one place
that constructs a Prisma client for the app. That is also why the onboarding chains live in
`src/server/services/tenancy/onboard.ts` rather than in the script bodies: the scripts' one
untestable act is calling Supabase's admin API, and everything after it belongs somewhere covered.

`src/server/db.ts`, `auth.ts` and `supabase.ts` carry `import "server-only"`. That closes a gap the
lint rule cannot see: the rule blocks importing the Prisma client, but nothing stopped a client
component importing `@/server/db` and pulling the client into the browser bundle. Keep the marker on
any new module under `src/server/`.

Known upstream noise: the integration suite prints a `pg` deprecation warning about overlapping
queries on one client. It comes from inside `@prisma/adapter-pg`'s transaction handling, not from
our code — do not chase it. It is a reason to keep `pg` pinned to `^8`.

⚠️ **Supabase's own setup snippets are written for Prisma 6 and will break this repo.** They tell
you to put `url` and `directUrl` inside the `datasource` block and to use the `prisma-client-js`
generator. Prisma 7 rejects both: the connection URL belongs in `prisma.config.ts`, and the
generator is `prisma-client` with an `output` path. If a migration suddenly fails with
`P1012 … datasource property 'url' is no longer supported`, someone pasted the old snippet.

Prisma 7 specifics worth knowing: the connection URL lives in `prisma.config.ts` rather than in
`schema.prisma`; the client is generated into `src/generated/prisma` (gitignored) instead of
`node_modules`; and the runtime connects through the `@prisma/adapter-pg` driver adapter.

**The generated client can go stale, and the error does not say so.** It is gitignored, so a `git
pull` that changes `schema.prisma` leaves the old client on disk, and `postinstall` only fires on
install. The symptom is `tsc` or Prisma complaining that a field "does not exist" — pointing at
whichever file happens to use it, usually a test, rather than at the real cause. `dev`, `build`,
`typecheck`, `test` and `test:integration` therefore all run `prisma generate` first via `pre*`
hooks. Keep that habit for any new script that compiles or runs application code; `npm run
db:generate` is the manual form.

`docs/decisions.md` tracks what is settled and what is open.

### Invariants the database enforces

Several rules from the list above are constraints, not conventions — the prototype relied on
application discipline for exactly these and lost real money to it:

- A trigger on `ledger_entries` rejects every UPDATE and DELETE. Corrections are appended
  (`MANUAL_ADJUSTMENT`, or `FULFILLMENT_FAILED` when an external reward order fails), never
  edited in place. TRUNCATE is deliberately _not_ blocked, so the test harness can reset.
- `CHECK` constraints: a ledger delta is never zero, a `MANUAL_ADJUSTMENT` requires a note, and
  reward amounts, reward costs and influenced revenue are non-negative.
- Unique indexes on `(opportunityId, reason)` and `(redemptionId, reason)` make reward crediting
  and redemption debiting idempotent in the database, so a retry or a double-click cannot pay
  twice.
- `advocates` is unique on `(businessId, email)`, never globally — the same person can advocate
  for two different customers.
- Deny-all RLS is enabled on every application table, and the `anon` / `authenticated` grants on
  `public` are revoked. That is a lock on Supabase's PostgREST, not a tenancy mechanism — see
  below.

When writing the trigger, do not set `USING ERRCODE` to anything in Postgres's 23xxx
integrity-constraint class: Prisma translates those into a generic constraint error and the
message is lost. The default `raise_exception` (P0001) passes through intact.

### Supabase's second door

The ESLint boundary governs our code. It says nothing about **PostgREST**, the REST API Supabase
runs over the `public` schema, and Supabase grants `anon` and `authenticated` access to that schema
by default. Tables our migrations create inherit the grant, so after the first deploy
`GET /rest/v1/businesses` returned 200 to anyone holding the publishable key — which is public by
design and ships in the browser bundle. Verified against the live project; the tables were empty,
so nothing leaked.

`20261101005003_lock_out_postgrest` closes it two ways: deny-all RLS on every table, and a REVOKE
of those roles' grants (including default privileges, so new tables are covered). Either alone
would do; both means a future migration that forgets one is still safe.

Three things to keep straight:

- **This is not a reversal of service-layer tenancy.** RLS here has deliberately **no policies** —
  enabled with none, it denies everything to non-owner roles, while the table owner (the role
  Prisma connects as) bypasses RLS entirely. It is a lock on a door we never open, not the
  mechanism that scopes tenants. Do not start writing policies to "do tenancy properly"; that
  splits the rules across two places, which is how the prototype got lost.
- **New tables need the same treatment.** Prisma does not emit `ENABLE ROW LEVEL SECURITY`, so add
  it by hand to the migration. `src/test/integration/postgrest-lockdown.integration.test.ts` fails
  if you forget.
- **If the app ever connects as a non-owner role**, the lock starts applying to us. The fix is a
  `BYPASSRLS` grant or an owner connection — never disabling RLS.

### Concurrency tests need two clients, and usually need a held lock

Two `$transaction` calls on the _same_ Prisma client do not reliably interleave, so a test that
fires both with `Promise.all` can pass against code with no concurrency protection at all. That is
not hypothetical: a claim-invite race test here stayed green after both of its compare-and-swaps
were replaced with plain writes. `separateTestPrisma()` in the harness gives a second connection
pool for genuine overlap — warm it with a query first, since a cold client's handshake outlasts the
transaction you are racing.

Even then, two claims fired at once do not produce the dangerous interleaving: whichever reads
second sees the committed result and stops at an ordinary pre-check. To cover the read-then-write
window itself, hold an **uncommitted** write on the row from the second client, start the operation
under test so it reads the old value and blocks on the lock, then release. The conditional update is
then the only thing that can notice. `advocates.integration.test.ts` has two of these, one per row
involved.

**When mutation-testing a guard, assert the mutation applied.** A search-and-replace that silently
misses — because Prettier rewrapped the line, say — reports a guard as load-bearing when the test
never ran against modified code. Two findings in this repo were briefly wrong for exactly that
reason.

### Testing layout

`npm test` is unit-only and needs no database. `npm run test:integration` uses
`vitest.integration.config.ts`, runs files matching `*.integration.test.ts` serially, and needs
`TEST_DATABASE_URL`. The harness in `src/test/integration/` is the one place outside
`src/server/**` allowed to construct a Prisma client; service tests should still go through
service functions rather than reaching past them.
