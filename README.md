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

**Dealio never holds customer money.** Each company configures its own prize catalog and
fulfills its own prizes, so Dealio's revenue is purely the software subscription.

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

| Script                | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `npm run dev`         | Dev server                                     |
| `npm run build`       | Production build                               |
| `npm run lint`        | ESLint, including the database-import boundary |
| `npm run typecheck`   | `tsc --noEmit`                                 |
| `npm test`            | Vitest once                                    |
| `npm run test:watch`  | Vitest in watch mode                           |
| `npm run format`      | Prettier write                                 |
| `npm run db:generate` | Regenerate the Prisma client                   |

CI runs format, lint, typecheck, test and build on every push.

## Layout

```
prisma.config.ts          Prisma CLI config; holds the connection URL (Prisma 7)
prisma/schema.prisma      Database schema (models land in Task 2)
src/
  app/                    Next.js App Router
  components/ui/          shadcn/ui components (added via CLI, then yours to edit)
  server/
    db.ts                 The only Prisma instance
    services/             All business rules; every function takes a TenantContext
  lib/                    Shared pure helpers (currency name lives here)
  test/                   Test setup
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
