# Decisions

Running record of what is settled, what is still open, and why. **This file is the source of
truth** for product and architecture decisions. The product brief in the prototype repo
(`README.md`, `dealio_info.txt`) is background: where it and this file disagree, this file wins.

Several items the brief still lists as open have since been decided. Those are settled — they are
not reopened by the brief not having been updated.

Add to this file whenever something is decided, and move the item out of **Open**. The reason an
entry exists is so the same question is not answered twice.

---

## Settled

### Product

| Decision           | Detail                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name               | **Dealio.** Not up for discussion                                                                                                                                                                                                                                                          |
| Scope              | Pilot-ready MVP for a solo or small team, with boundaries that let features land later without rework                                                                                                                                                                                      |
| MVP loop           | Invite advocate → post opportunity → advocate completes → company verifies → currency awarded → advocate redeems → company sees activity and reward                                                                                                                                        |
| Who funds rewards  | **The customer company.** Dealio never holds customer money and companies fulfill their own prizes. This also keeps prize cost separate from the subscription — the brief's most important open pricing question                                                                           |
| Prize catalog      | Per business, not one shared global catalog                                                                                                                                                                                                                                                |
| Reward approval    | Manual, never automatic                                                                                                                                                                                                                                                                    |
| Approval authority | **Per business, chosen at onboarding.** A business may require admin sign-off for new opportunities and for reward allotments, or delegate both to its reps. Two independent flags, defaulting to require-approval, changeable later. Changes apply forward only and never rewrite history |
| Reward trigger     | A **verified completed action**, for the MVP                                                                                                                                                                                                                                               |
| Influenced revenue | Minimal — an optional amount recorded at verification plus a displayed total                                                                                                                                                                                                               |
| Billing            | None in the MVP                                                                                                                                                                                                                                                                            |
| Integrations       | Standalone first. HubSpot and Salesforce are phase 2, built only when a paying customer justifies them                                                                                                                                                                                     |
| Deferred           | Leaderboards, deep analytics, CRM integrations, elaborate reward systems                                                                                                                                                                                                                   |

### Technical

| Decision          | Detail                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack             | Next.js 16 (App Router) + React 19 + TypeScript, Postgres via Prisma 7, Supabase Auth                                                                                                                                                       |
| Prisma 7          | Adopted over 6.x deliberately. Note Prisma's npm `latest` tag is an **8.0 release candidate** — 7.10.1 is the newest stable. v7 moves the connection URL to `prisma.config.ts` and connects through the `@prisma/adapter-pg` driver adapter |
| Repo              | This one. `dealio-referrals` stays read-only reference                                                                                                                                                                                      |
| Hosting           | Vercel + Supabase + Resend                                                                                                                                                                                                                  |
| UI components     | shadcn/ui, `base-vega` style, built on Base UI rather than Radix. Class merging via `cn` (official shadcn package, replaces `clsx` + `tailwind-merge`). Components are copied into `src/components/ui/` and owned by us                     |
| Advocate auth     | Hybrid — magic link primary, with password and Google also available                                                                                                                                                                        |
| Roles             | All four modeled; UI for business admin and advocate only in the MVP. Platform staff is a **separate table**, never a role value                                                                                                            |
| Tenant isolation  | Service layer, not RLS — sound only because the browser has no database access. Enforced by ESLint                                                                                                                                          |
| Currency          | Append-only ledger, balance derived as a sum. No mutable balance column                                                                                                                                                                     |
| Testing           | Unit plus integration against a real throwaway Postgres, written test-first                                                                                                                                                                 |
| Advocate identity | `Advocate` is unique on `(businessId, email)`, not globally — the same person can be an advocate for two different customers. Claiming an invite requires a token                                                                           |

---

## Open

| Question                      | Notes                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Currency name                 | "Coins" is a placeholder. Wants short, punchy, positive — like _Kudos_, _Zaps_, _Sparks_. Rejected: _Dealios_, _credits_, _points_. Brainstormed: _Props, Pings, Zings, Amp, Glow, Buzz, Pops, Bumps, Snaps, Cheers, Nods, Pips, Dings, Drops_. Isolated to `src/lib/currency.ts`, so renaming is one line |
| Per-activity reward amounts   | The model supports it — `rewardAmount` is per-opportunity. The question is what the defaults should be                                                                                                                                                                                                     |
| Balance expiration            | Not built. Needs no schema change later: a negative ledger entry with reason `EXPIRED`                                                                                                                                                                                                                     |
| Duplicate and fraud handling  | Not built. Double-crediting is already prevented by idempotency on `opportunityId`                                                                                                                                                                                                                         |
| Richer reward triggers        | Whether a qualified lead or closed deal should also trigger a reward. Additive later — new ledger reasons from new lifecycle transitions                                                                                                                                                                   |
| Fuller revenue attribution    | Referral → pipeline → closed-won, beyond the minimal version                                                                                                                                                                                                                                               |
| Pricing                       | ~$200/month per AE/AM seat is an unvalidated hypothesis. Tiers, seat definitions and contract structure all open. No billing in the MVP, so this blocks nothing yet                                                                                                                                        |
| Brand                         | Logo, palette and slogan. Explored but not final: deep navy / near-black, vibrant green, off-white. Tokens are in `src/app/globals.css`                                                                                                                                                                    |
| Initial customer segment      | Affects go-to-market, not the build                                                                                                                                                                                                                                                                        |
| Competitive positioning       | Needs real market research                                                                                                                                                                                                                                                                                 |
| Rep self-verification default | Which way a _new_ business should default is settled (require approval), but whether onboarding should present this as one choice or two is a UX call                                                                                                                                                      |

---

## Log

**2026-10-31 — Rebuild decided and scaffolded.**
The prototype was reviewed in full before this was chosen, which the brief requires ("before
recommending a rebuild, establish the current codebase and implementation state"). Findings are in
`docs/prototype-assessment.md`. Decisions above were settled across two planning sessions. This
repo now holds the bare-bones stack: Next.js, TypeScript, Tailwind, Vitest, ESLint with the
database-import boundary, and a Prisma datasource with no models yet. Next: Task 2, the domain
schema and the integration-test harness.
