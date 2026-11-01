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
| Reward fulfillment | **Tremendous API.** A sandbox account exists. Replaces the earlier plan of companies fulfilling prizes by hand. Who owns the funding account is still open — see below                                                                                                                     |
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
| Tenant isolation  | Service layer, not RLS — sound only because the browser has no database access. Enforced by ESLint. RLS **is** enabled, deny-all with no policies, purely to lock Supabase's PostgREST out; it is not the tenancy mechanism                 |
| Currency          | Append-only ledger, balance derived as a sum. No mutable balance column                                                                                                                                                                     |
| Testing           | Unit plus integration against a real throwaway Postgres, written test-first                                                                                                                                                                 |
| Advocate identity | `Advocate` is unique on `(businessId, email)`, not globally — the same person can be an advocate for two different customers. Claiming an invite requires a token                                                                           |
| Naming            | Domain names stay (`Opportunity`, `opportunities`, `OpportunityStatus`); user-facing nouns live in `src/lib/terms.ts`, where the product's word is **quest**. Copy has moved once already, so the schema does not follow it                 |

---

## Open

| Question                        | Notes                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tremendous platform partnership | Settled _how_ (OAuth per business), but becoming a Tremendous "Platforms" partner looks like a commercial and compliance step with lead time, and their team reviews each customer organization before approval. Worth starting early — it is a dependency on another company, not on us                   |
| Token encryption approach       | Per-business OAuth tokens are the first genuinely sensitive secret in the system. Envelope encryption with a key from the environment is the likely answer; decide before the connection table is written                                                                                                  |
| Currency name                   | "Coins" is a placeholder. Wants short, punchy, positive — like _Kudos_, _Zaps_, _Sparks_. Rejected: _Dealios_, _credits_, _points_. Brainstormed: _Props, Pings, Zings, Amp, Glow, Buzz, Pops, Bumps, Snaps, Cheers, Nods, Pips, Dings, Drops_. Isolated to `src/lib/currency.ts`, so renaming is one line |
| Per-activity reward amounts     | The model supports it — `rewardAmount` is per-opportunity. The question is what the defaults should be                                                                                                                                                                                                     |
| Balance expiration              | Not built. Needs no schema change later: a negative ledger entry with reason `EXPIRED`                                                                                                                                                                                                                     |
| Duplicate and fraud handling    | Not built. Double-crediting is already prevented by idempotency on `opportunityId`                                                                                                                                                                                                                         |
| Richer reward triggers          | Whether a qualified lead or closed deal should also trigger a reward. Additive later — new ledger reasons from new lifecycle transitions                                                                                                                                                                   |
| Fuller revenue attribution      | Referral → pipeline → closed-won, beyond the minimal version                                                                                                                                                                                                                                               |
| Pricing                         | ~$200/month per AE/AM seat is an unvalidated hypothesis. Tiers, seat definitions and contract structure all open. No billing in the MVP, so this blocks nothing yet                                                                                                                                        |
| Brand                           | Logo, palette and slogan. Explored but not final: deep navy / near-black, vibrant green, off-white. Tokens are in `src/app/globals.css`                                                                                                                                                                    |
| Initial customer segment        | Affects go-to-market, not the build                                                                                                                                                                                                                                                                        |
| Competitive positioning         | Needs real market research                                                                                                                                                                                                                                                                                 |
| Rep self-verification default   | Which way a _new_ business should default is settled (require approval), but whether onboarding should present this as one choice or two is a UX call                                                                                                                                                      |

---

## Reward fulfillment via Tremendous

Decided: redemptions are fulfilled through the [Tremendous](https://www.tremendous.com) API rather
than by hand. A sandbox account exists.

**Dealio does not hold customer float.** Each customer business connects its **own Tremendous
organization**, and Dealio issues payouts against that organization's balance. The payment method
belongs to the business and Dealio never sees it. Tremendous describes this as the platform
"completely removing itself from handling the customer's money", which is the property we want.

The mechanism is **Tremendous Connect** (also called Tremendous for Platforms), not plain OAuth and
not a pasted API key. Confirmed against the live docs: _"Customers fund their own balances and
manage their own payment methods. The platform does not hold the funds."_

### How the connection works

Dealio drives the onboarding rather than telling the business to go sign up:

1. Dealio creates a **connected organization** for the business via the API, optionally prefilling
   KYB details, then a **connected organization member** for the individual user (email + name).
2. Dealio requests a **session URL** for that user with a `return_url`. Session URLs are temporary
   — generate a fresh one each time rather than storing it.
3. The business completes onboarding on Tremendous: business information for compliance review,
   accepting terms, and adding a payment method to fund its own balance.
4. Tremendous' compliance team reviews the organization. It can be rejected.

The flow is **webhook-driven**, with four events that map directly onto the connection states
Dealio needs to model:

| Webhook                                   | Meaning                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `CONNECTED_ORGANIZATIONS.REGISTERED`      | The user finished onboarding                                  |
| `CONNECTED_ORGANIZATIONS.STATUS.APPROVED` | Compliance approved the organization                          |
| `CONNECTED_ORGANIZATIONS.OAUTH.GRANTED`   | Carries the `oauth_code`. **Wait for this before continuing** |
| `CONNECTED_ORGANIZATIONS.STATUS.REJECTED` | Compliance rejected it                                        |

Dealio exchanges the `oauth_code` for access and refresh tokens, then calls the API on the
business's behalf.

### Three details worth knowing before building

- **Refresh tokens never expire but are single-use.** Each refresh returns a _new_ refresh token
  that must replace the stored one. This is a genuine hazard: lose the new token — a crash between
  the HTTP response and the database write — and the connection is dead, with the customer having
  to re-onboard. Persist the new token before relying on the new access token, and treat the
  refresh as a critical section rather than an incidental retry.
- **`default` scope is sufficient**, so ask for nothing more. It covers campaigns, fields, funding
  sources, invoices, orders and products in full, plus read-only organizations and members. We do
  not need `team_management` or `fraud_prevention`.
- **The docs give a production authorize host (`api.tremendous.com/oauth/authorize`) but only show
  the testflight host for token exchange.** Confirm the production token endpoint against the
  sandbox before going live rather than assuming it mirrors the authorize host.

Optional later: Tremendous can top up a customer balance via the API using their saved payment
method. Balances default to USD and support EUR, GBP and CAD; rewards can be sent in other
currencies, converted at the current rate.

### Consequences for Dealio

- **A connection record per business**, holding the access token, the current refresh token, expiry
  and the Tremendous organization id. These are the first genuinely sensitive secrets Dealio
  stores: encrypted at rest, never logged, never `NEXT_PUBLIC_`, never sent to the browser. A
  leaked token can spend a customer's money.
- **Connection states follow the webhooks above**, so a business can be registered-but-unapproved
  or approved-but-not-yet-granted. The UI should say which, rather than failing a redemption with a
  vague error.
- **Token refresh is a background concern**, and must never surface as a failed redemption.
- **Onboarding gains a step.** Until a business is connected, it can still run opportunities and
  accrue currency — only fulfillment is blocked. Keeping those independent lets a pilot start
  before the Tremendous compliance review clears, which is a dependency on another company.
- **Insufficient balance is the business's to resolve**, not Dealio's. Surface it to the admin and
  hold the redemption rather than failing it outright.

Notes for when this is implemented — recorded now so they are not rediscovered:

- **The ledger stays the source of truth, and the transaction boundary changes.** A database
  transaction cannot stay open across an HTTP call to Tremendous. So: approve the redemption and
  write the debit in one transaction, _then_ place the order. If the order fails, write a
  compensating credit with reason `FULFILLMENT_FAILED` — never delete or update the debit, because
  `LedgerEntry` is append-only (invariant 1). The redemption's own status carries the external
  outcome.
- **Idempotency.** Tremendous orders accept an external identifier; use the `Redemption` id so a
  retry or a double-click cannot send two gift cards. This matters more here than anywhere else in
  the system, because the failure mode costs real money.
- **Webhooks.** Delivery outcome arrives asynchronously, so `Redemption` needs states beyond
  approved — ordered, delivered, failed — and a handler that is safe to replay. Reuse the
  prototype's convention of deterministic event ids for retry-safe writes.
- **Environments.** Sandbox and production differ by base URL and key. The key is server-side only
  and must never be `NEXT_PUBLIC_`. Add both to `.env.example` when the work starts.
- **Catalog.** Tremendous decides what is orderable, so the per-business catalog should reference
  Tremendous products rather than free text. `Reward.tremendousProductId` is in place for this;
  whether `name`/`description` should be derived from the Tremendous product rather than typed by
  an admin is still open.
- **Failure with real cost.** Insufficient funds in the funding account is a normal operating
  condition, not an edge case. It needs a clear path for both the advocate and the admin.

## Supabase specifics

**Keys.** Use the newer `sb_publishable_…` and `sb_secret_…` keys. The legacy `anon` and
`service_role` JWTs are deprecated. Env names are `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY`; the secret one must never carry a `NEXT_PUBLIC_` prefix.

**Email confirmation: off during development, on before the pilot.**

Normally turning this off would be dangerous here — it lets someone sign up with an address they do
not control, and the prototype's advocate-claim path matched on bare lowercased email, which made
exactly that spoofable.

It is safe for us because nothing trusts the email address:

- Claiming an advocate invite requires the **token**, never an email match.
- `resolveIdentity` matches advocate records by `userId` only, so an unclaimed invite grants nothing
  regardless of whose email it names.
- `ensureUser` keys on `supabaseUserId` and refuses to move an email between auth users.

So an unverified signup produces an account with no tenant context and no access at all.

**This must stay true.** Do not add an email-match fallback to invite claiming, however convenient
it looks — that single shortcut is what would make this setting load-bearing again. Turn
confirmation on before the pilot regardless, since it also stops typo'd addresses silently
swallowing invites.

**PostgREST is a second door, and it was open.** Supabase runs a REST API over the `public`
schema and grants `anon` and `authenticated` access to it by default, so tables created by our
migrations were served over HTTPS to anyone holding the publishable key. Confirmed against the live
project — `GET /rest/v1/businesses` returned 200 — with empty tables, so nothing leaked.

This is the prototype's root defect (the browser holding direct database access) arriving through a
door the ESLint boundary cannot see, which is why it is worth stating plainly: **the architecture's
load-bearing rule is a property of the deployment, not only of our code.** Checking the lint rule
was never sufficient on its own.

`20261101005003_lock_out_postgrest` enables deny-all RLS on every table and revokes both roles'
grants and default privileges. No policies, deliberately: the table owner bypasses RLS, so Prisma
is unaffected, and tenancy stays in one place. A new table must enable RLS in its own migration;
an integration test fails if it does not.

**Connection.** Postgres goes through the shared pooler host (`…pooler.supabase.com`): transaction
mode on 6543 for the app, session mode on 5432 for migrations. Prisma 7 takes both from
`prisma.config.ts`, not from `schema.prisma`.

## Carried over from the prototype

Skim of `dealio-referrals@06ccc81` on 2026-11-01 — 36 commits of UI and product jamming since the
rebuild was decided. What it changed, and what we do about each.

### Naming: "opportunity" became "quest"

The prototype renamed the user-facing noun (`5ce6483`). It is **copy only**. No table, file, hook,
enum or event type moved: `opportunities`, `opportunity_id`, `opportunity_created` and
`opportunity-response` all stand, the components are still `CreateOpportunityDialog.tsx` and
`useOpportunities.ts`, and the rename reached existing data through a
`replace(description, 'Opportunity', 'Quest')` over `activity_log`. So "quest" is presentation and
"opportunity" is still the domain term there.

**Decided: copy only here too.** `Opportunity` stays the domain name and "quest" lives in
`src/lib/terms.ts`, alongside the currency name and for the same reason — a rename is one line
rather than a migration. A domain rename would have been cheapest now, with no data and no feature
code, and was considered on that basis; it was declined because the word has already changed once
and nothing says it has stopped. "Coins" was not renamed.

### Reward catalog: digital gift cards, and a first price point

Merchandise was deactivated and replaced with five email-delivered gift cards. The coin costs imply
a rate of roughly **$5 per coin** — 5 coins for $25, 10 for $50, 20 for $100, 50 for $250. That is
the first concrete monetary value anyone has put on the currency, and it is worth treating as data
for the open "per-activity reward amounts" question rather than as a decision.

It also confirms the Tremendous choice is pointed the right way: the catalog the prototype landed on
is digital gift cards delivered by email, which is exactly what Tremendous fulfills.

### Redemptions should snapshot more than the price

Deleting a reward used to break historical redemptions. The prototype fixed it by denormalizing
`reward_name` and `reward_value` onto `coin_redemptions`, then making `reward_id` nullable with
`ON DELETE SET NULL`.

We are already safe against the orphan — `Reward.isActive` soft-deactivates and `Redemption.rewardId`
is required, so Postgres refuses to delete a referenced reward. And `Redemption.cost` already
snapshots the price, for the stated reason that later catalog edits must not change what was already
agreed. But the **name** was not snapshotted, and the same reasoning applies to it: rename a reward and
every past redemption silently re-labels itself.

**Decided: snapshot it.** `Redemption.rewardName` is required, added in
`20261101021727_snapshot_reward_name`. The migration adds a `NOT NULL` column with no default, so it
would fail against a non-empty `redemptions` table — correct for a field that records agreed terms,
where backfilling an empty string would be worse than stopping. Three integration tests cover it:
the snapshot survives a rename and a reprice, the column cannot be bypassed with raw SQL, and a
reward with redemptions against it cannot be hard-deleted.

### UX patterns worth taking

- **One-click accept or decline from the email**, landing back on the app with `?accepted=1` so it
  can celebrate on arrival. The plan already has the response flow; the query-param handoff is the
  detail worth copying.
- **Three full-screen celebrations** (quest accepted, quest completed, coins earned) in
  framer-motion: click to dismiss, auto-dismiss after 3.4–3.8s. We have no animation library yet;
  that is a Task 9/13 decision, not a schema one.
- **Celebrate once, not on every poll.** They keep a `localStorage` set of already-celebrated
  approvals. The requirement is real; server-side we can key it on the ledger entry instead of
  trusting the browser to remember.
- **Inline approve/reject** in the dashboard list rather than through a dialog.
- Prospect phone was dropped from the create form.

Not worth copying: admin reward mutations now append `.select()` and read an empty result as "you
may not have permission", because PostgREST with RLS returns success for zero affected rows. That is
a workaround for the prototype's architecture — our services raise `ForbiddenError` — and it is a
good illustration of why authority belongs in a service layer rather than in policies.

### Lovable moved the prototype to Drizzle

Schema changes there now run through `drizzle.config.ts` and `drizzle/migrations/*.sql` against
`LOVABLE_DB_MIGRATION_URL`. `drizzle/schema.ts` is a stub marked "auto-generated and intentionally
left blank", so the migrations are hand-written SQL and Drizzle is only the runner. Nothing to
adopt — we use Prisma migrations — but it means the prototype's own instruction to put schema
changes in `supabase/migrations/` is now stale in that repo too.

### A new defect, in a path that was previously hardened

`Dashboard.handleApproveCoins` is new and credits currency **from the browser**: it reads the
balance out of a React Query cache snapshot, writes `coins_earned` as an absolute value, and does so
in a second write that is not atomic with setting `coins_approved`. It **bypasses** the
compare-and-swap in `useSendCoins`, which is still intact.

So the record that "the award path was hardened" is now true of only one of two award paths. Two
admins approving at once lose a credit; a failure between the two writes marks an opportunity
approved with nothing credited. Our invariant 1 — currency moves only inside the transaction that
writes the ledger row — exists precisely because this keeps happening, and it happening again in a
path someone had already fixed is the strongest argument yet that the capability, not the call site,
is the problem.

## Log

**2026-11-01 — Skimmed the prototype's latest and recorded what to carry over.**
36 commits of product jamming since the rebuild was decided. Three things that matter: the
user-facing noun became "quest" (copy only — the domain is still "opportunity" there); the reward
catalog became email-delivered gift cards at an implied ~$5 per coin, which is the first price ever
put on the currency and corroborates the Tremendous direction; and a newly added dashboard approve
button credits currency from the browser, bypassing the compare-and-swap that had already fixed the
other award path. Details above under **Carried over from the prototype**.

**2026-11-01 — Closed Supabase's PostgREST exposure.**
The init migration deployed cleanly to Supabase, and a probe of the project immediately afterwards
found every table readable over `/rest/v1/` with nothing but the publishable key. Supabase grants
`anon` and `authenticated` access to the `public` schema by default and our tables inherited it.
Tables were empty, so nothing leaked. Fixed by `20261101005003_lock_out_postgrest` — deny-all RLS
plus a REVOKE of both roles' grants and default privileges — with a regression test that fails if a
new table arrives without RLS or if anyone adds a policy. Worth recording the lesson rather than
just the fix: the boundary we rely on is enforced by the lint rule _and_ by the deployment, and
only one of those was being checked.

**2026-10-31 — Task 3: tenant context and the service boundary.**
`src/server/context.ts` holds the actor model and all authority decisions, pure and exhaustively
tested. Two deliberate divergences from the original plan, both recorded because they are
load-bearing. First, services take `{ db, actor }` rather than a bare `TenantContext`: invariant 1
requires a currency movement and its ledger row to be atomic, so a service has to be composable
into a caller's transaction, which a service closing over the `prisma` singleton could not be.
Second, `resolveIdentity` returns every business a user belongs to rather than one resolved actor —
a person can be a rep at one business and an advocate of another, and silently picking a "current"
business is exactly the cross-tenant bug this design exists to prevent; `soleTenantContext` refuses
when the choice is ambiguous.

The database-import boundary moved to the typescript-eslint rule so type-only imports can be
exempted, which lets the UI share domain enums instead of hand-duplicating them while keeping the
runtime client unreachable. It is now covered by `src/server/boundary.test.ts` — twelve cases
asserting both directions — rather than verified by hand.

**2026-10-31 — Task 2: schema and integration harness.**
Full domain schema migrated: `User`, `PlatformStaff`, `Business`, `Membership`, `Advocate`,
`AdvocateInvite`, `Opportunity`, `OpportunityEvent`, `LedgerEntry`, `Reward`, `Redemption`.
Invariants pushed into the database rather than left to the service layer — an append-only
trigger on the ledger, check constraints on money and notes, and unique indexes that make reward
crediting idempotent. Integration harness runs the committed migrations against a real Postgres
and truncates between tests; 19 tests cover the invariants by trying to violate them directly.
`Reward.tremendousProductId` and the asynchronous `Redemption` states are in place so Tremendous
fulfillment is additive rather than a migration. Added a Postgres service to CI.

**2026-10-31 — Rebuild decided and scaffolded.**
The prototype was reviewed in full before this was chosen, which the brief requires ("before
recommending a rebuild, establish the current codebase and implementation state"). Findings are in
`docs/prototype-assessment.md`. Decisions above were settled across two planning sessions. This
repo now holds the bare-bones stack: Next.js, TypeScript, Tailwind, Vitest, ESLint with the
database-import boundary, and a Prisma datasource with no models yet. Next: Task 2, the domain
schema and the integration-test harness.
