# Dealio — agent context

## What this is

The ground-up rebuild of Dealio, a customer advocacy platform for B2B SaaS sales teams. Reps
post advocacy opportunities; the company's customers ("advocates") complete them, earn a virtual
currency, and redeem it for prizes the company fulfills.

Two audiences: the **business side** (business admins and reps) and the **advocates**. They are
different people with different permissions, and the layout should always make clear which one a
file serves.

## The one rule that matters

**The browser never touches the database.**

The Prisma client is importable only from `src/server/db.ts` and `src/server/services/**` —
that covers the generated client in `src/generated/prisma`, the `@prisma/client` package and the
`@prisma/adapter-pg` driver adapter. Enforced by `no-restricted-imports` in `eslint.config.mjs`,
not by convention. Pages, components,
route handlers and server actions call a service function that takes a `TenantContext`.

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
- **Money and currency amounts are integers.** No floats.
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

Scaffold only. Next.js 16 + React 19 + TypeScript + Tailwind 4, shadcn/ui on Base UI, Vitest 5,
ESLint 9 (flat config) with the database boundary, and Prisma 7 with no models yet.

Prisma 7 specifics worth knowing: the connection URL lives in `prisma.config.ts` rather than in
`schema.prisma`; the client is generated into `src/generated/prisma` (gitignored) instead of
`node_modules`; and the runtime connects through the `@prisma/adapter-pg` driver adapter. Run
`npm run db:generate` after changing the schema — `postinstall` does it on a fresh install. The domain schema and the integration-test harness are
Task 2. `docs/decisions.md` tracks what is settled and what is open.
