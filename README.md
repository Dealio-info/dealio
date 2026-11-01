# Dealio

**Customer advocacy platform for SaaS sales teams.**

Dealio helps B2B SaaS companies turn happy customers into a repeatable sales advantage. Sales
teams post advocacy opportunities — referrals, reference calls, testimonials, case studies,
intros — their customers complete them, and those customers earn a virtual reward currency they
redeem for prizes. The company tracks participation, rewards, and the revenue advocacy influences.

Gamification is the mechanism. Revenue impact is the outcome.

> **Status: in development.** This is the ground-up rebuild. The earlier prototype lives at
> [`Dealio-info/dealio-referrals`](https://github.com/Dealio-info/dealio-referrals) and is
> reference only — see [`docs/prototype-assessment.md`](docs/prototype-assessment.md).

---

## How it works

A company invites a customer to become an advocate. A rep posts a request. The advocate accepts
and completes it. The company verifies it happened. The advocate earns currency, requests a
prize, and the company approves and fulfills it. Both sides see the activity; the company also
sees influenced revenue.

Activity lifecycle: **requested → accepted → completed → verified → rewarded**, with `declined`
and `cancelled` as exits.

Redemptions are fulfilled through the [Tremendous](https://www.tremendous.com) API. **Dealio holds
no customer float**: each company connects its own Tremendous organization over OAuth, and payouts
are issued against that company's balance. The payment method belongs to the company and Dealio
never sees it, so Dealio's revenue is purely the software subscription.

## Stack

| Layer         | Choice                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router) + React 19 + TypeScript, strict                |
| Database      | Postgres via Prisma 7 (driver adapter; URL in `prisma.config.ts`)      |
| Auth          | Supabase Auth — magic link, password, Google                           |
| Styling       | Tailwind CSS v4                                                        |
| UI components | shadcn/ui (`base-vega` style, on Base UI), with `cn` for class merging |
| Tests         | Vitest, unit + integration against a real Postgres                     |
| Hosting       | Vercel, with Supabase and Resend                                       |

## Getting started

Requires Node 22+.

```sh
npm install           # also runs `prisma generate`
cp .env.example .env  # then fill it in
npm run dev           # http://localhost:3000
```

### Scripts

| Script                     | What it does                                     |
| -------------------------- | ------------------------------------------------ |
| `npm run dev`              | Dev server                                       |
| `npm run build`            | Production build                                 |
| `npm run lint`             | ESLint, including the database-import boundary   |
| `npm run typecheck`        | `tsc --noEmit`                                   |
| `npm test`                 | Vitest once                                      |
| `npm run test:watch`       | Vitest in watch mode                             |
| `npm run format`           | Prettier write                                   |
| `npm run db:generate`      | Regenerate the Prisma client (usually automatic) |
| `npm run db:migrate`       | Create and apply a migration in development      |
| `npm run db:deploy`        | Apply committed migrations (CI and production)   |
| `npm run test:integration` | Integration tests against a real Postgres        |
| `npm run verify:lockdown`  | Check a live Supabase project is locked down     |
| `npm run grant:staff`      | Make someone Dealio staff (run once, first)      |
| `npm run seed:business`    | Onboard a business and its first admin           |
| `npm run test:all`         | Unit then integration                            |

### Auth

Sign-in is Supabase Auth: magic link by default, with password and Google. Magic link leads because
advocates sign in rarely, and a password set once and forgotten is friction that costs
participation.

`src/proxy.ts` refreshes the session and keeps signed-out visitors out of `/app` and `/advocate`.
It checks only for a session, not roles — roles need the database, and it cannot reach one. Treat it
as a convenience redirect; the service layer is the security boundary.

It is called `proxy` because Next 16 renamed the `middleware` convention. Same behaviour, same
`config.matcher`; the exported function is `proxy`.

CI runs format, lint, typecheck, unit tests, integration tests and build on every push.

### Integration tests

`npm test` is pure unit tests and needs no database. `npm run test:integration` needs a real
Postgres, because the invariants most worth testing live in the database — the append-only ledger
trigger, the check constraints, and the idempotency unique indexes. A mock would prove nothing
about them.

Point `TEST_DATABASE_URL` at a throwaway database; the suite creates it if missing, applies the
committed migrations, and truncates every table between tests. It must differ from `DATABASE_URL`,
and the harness refuses to run if they match.

Any Postgres will do — `npx prisma dev`, Docker (`docker run --rm -p 5432:5432 -e
POSTGRES_PASSWORD=postgres postgres:16`), or a local install.

**Keep `TEST_DATABASE_URL` pointed at a local throwaway database, never at Supabase.** The harness
truncates every table between tests; the only guard is that it refuses to run when the two URLs
match, which would not save a Supabase URL set by mistake.

The Prisma client is generated into `src/generated/prisma`, which is gitignored — so after a pull
that changes the schema, the client on disk is stale. `dev`, `build`, `typecheck`, `test` and
`test:integration` regenerate it first, so this normally takes care of itself; `npm run
db:generate` is the manual form if you need it.

### Applying migrations

`npm run db:deploy` needs a direct TCP connection to Postgres on 5432. Run it from a machine or CI
runner that has one — a Claude Code cloud session tunnels HTTPS only, so Postgres ports are
unreachable there and `prisma migrate` will fail with `P1001`.

Check the migration count it prints. `No pending migrations to apply` means nothing was applied,
which is also what you see when your checkout is behind the branch holding the migration.

Afterwards, run `npm run verify:lockdown`. It asks the live project for every table over PostgREST
using the publishable key and fails unless each one is refused. It is a deploy check, not a test:
the integration suite proves what the migrations do on any Postgres, and this proves they reached
this project. It fails closed, so a missing key or an unfamiliar response is a failure rather than
a pass.

### Onboarding a business

There is no self-serve signup. Dealio staff onboard a business with two scripts, and both need
`DATABASE_URL` and `SUPABASE_SECRET_KEY` — so run them from a machine with a direct Postgres
connection, not from a cloud session.

```sh
npm run grant:staff    -- --email you@dealio.info --name "Your Name"
npm run seed:business  -- --name "Acme Corp" --admin-email ceo@acme.com
```

`grant:staff` comes first: `seed:business` acts as a named platform staff member and refuses rather
than inventing one. Both print a single-use link for setting a password; pass `--send` to have
Supabase email it instead. Printing is the default because Supabase's built-in SMTP is rate-limited
to a few messages an hour — our own sending arrives with Resend in Task 14.

Both flags of the approval policy default to requiring admin sign-off. `--delegate-opportunities`
and `--delegate-rewards` hand the respective decision to the business's own reps. Run
`npm run seed:business` with no arguments for the full list.

The scripts run under `tsx --conditions=react-server`. That is not decoration: `src/server/db.ts`
carries `import "server-only"`, which throws under node's default resolution and resolves to an
empty module under that condition — the same one Next sets for server components. Without it every
script that reaches the database dies on import.

## Layout

```
prisma.config.ts          Prisma CLI config; holds the connection URL (Prisma 7)
prisma/schema.prisma      Database schema
prisma/migrations/        Committed migration history
src/
  app/                    Next.js App Router
  components/ui/          shadcn/ui components (added via CLI, then yours to edit)
  server/
    db.ts                 The only Prisma instance
    services/             All business rules; every function takes a TenantContext
  lib/                    Shared pure helpers (currency name lives here)
  test/                   Test setup
    integration/          Integration harness, fixtures and schema tests
docs/
  decisions.md            Running record of decisions and open questions
  prototype-assessment.md Why this is a rebuild, and what the prototype is good for
```

## Architecture in one rule

**The browser never touches the database.** Prisma is importable only from `src/server/db.ts`
and `src/server/services/**`, enforced by ESLint rather than by convention. Everything else
calls a service function that takes a `TenantContext`.

This is what makes service-layer tenant isolation sound, and it is a direct response to the
prototype, where the browser held direct database access and every cross-tenant defect followed
from it. [`CLAUDE.md`](CLAUDE.md) has the full set of rules.

The rule is a property of the deployment as much as of the code. Supabase runs **PostgREST** over
the `public` schema and grants it to `anon` and `authenticated` by default, which the lint rule
cannot see — so every table is also locked with deny-all RLS and those grants are revoked. No
policies: tenancy stays in the service layer, and the lock exists only to shut a door we never
open. **A new table must enable RLS in its own migration**; an integration test fails if it does
not.

## Where decisions live

[`docs/decisions.md`](docs/decisions.md) is the running record — what is settled, what is still
open, and why. Read it before proposing product or architecture changes, and add to it when
something is decided. The product brief in the prototype repo is background: where it and the
current plan disagree, the plan wins.
