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

| Script                     | What it does                                   |
| -------------------------- | ---------------------------------------------- |
| `npm run dev`              | Dev server                                     |
| `npm run build`            | Production build                               |
| `npm run lint`             | ESLint, including the database-import boundary |
| `npm run typecheck`        | `tsc --noEmit`                                 |
| `npm test`                 | Vitest once                                    |
| `npm run test:watch`       | Vitest in watch mode                           |
| `npm run format`           | Prettier write                                 |
| `npm run db:generate`      | Regenerate the Prisma client                   |
| `npm run db:migrate`       | Create and apply a migration in development    |
| `npm run db:deploy`        | Apply committed migrations (CI and production) |
| `npm run test:integration` | Integration tests against a real Postgres      |
| `npm run test:all`         | Unit then integration                          |

### Auth

Sign-in is Supabase Auth: magic link by default, with password and Google. Magic link leads because
advocates sign in rarely, and a password set once and forgotten is friction that costs
participation.

`src/middleware.ts` refreshes the session and keeps signed-out visitors out of `/app` and
`/advocate`. It checks only for a session, not roles — roles need the database, and middleware
cannot reach it. Treat it as a convenience redirect; the service layer is the security boundary.

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

## Where decisions live

[`docs/decisions.md`](docs/decisions.md) is the running record — what is settled, what is still
open, and why. Read it before proposing product or architecture changes, and add to it when
something is decided. The product brief in the prototype repo is background: where it and the
current plan disagree, the plan wins.
