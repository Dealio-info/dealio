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
| Business home     | `/app` leads with a dashboard, with Advocates, Quests, Rewards and Settings as siblings. Confirmed after walking the shell. The wordmark returns there, so the Dashboard tab is a convenience rather than the only way back                 |
| Naming            | Domain names stay (`Opportunity`, `opportunities`, `OpportunityStatus`); user-facing nouns live in `src/lib/terms.ts`, where the product's word is **quest**. Copy has moved once already, so the schema does not follow it                 |

---

## Open

| Question                        | Notes                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tremendous platform partnership | Settled _how_ (OAuth per business), but becoming a Tremendous "Platforms" partner looks like a commercial and compliance step with lead time, and their team reviews each customer organization before approval. Worth starting early — it is a dependency on another company, not on us                                                                     |
| Token encryption approach       | Per-business OAuth tokens are the first genuinely sensitive secret in the system. Envelope encryption with a key from the environment is the likely answer; decide before the connection table is written                                                                                                                                                    |
| Currency name                   | "Coins" is a placeholder. Wants short, punchy, positive — like _Kudos_, _Zaps_, _Sparks_. Rejected: _Dealios_, _credits_, _points_. Brainstormed: _Props, Pings, Zings, Amp, Glow, Buzz, Pops, Bumps, Snaps, Cheers, Nods, Pips, Dings, Drops_. Isolated to `src/lib/currency.ts`, so renaming is one line                                                   |
| Per-activity reward amounts     | The model supports it — `rewardAmount` is per-opportunity. The question is what the defaults should be                                                                                                                                                                                                                                                       |
| Balance expiration              | Not built. Needs no schema change later: a negative ledger entry with reason `EXPIRED`                                                                                                                                                                                                                                                                       |
| Duplicate and fraud handling    | Not built. Double-crediting is already prevented by idempotency on `opportunityId`                                                                                                                                                                                                                                                                           |
| Richer reward triggers          | Whether a qualified lead or closed deal should also trigger a reward. Additive later — new ledger reasons from new lifecycle transitions                                                                                                                                                                                                                     |
| Fuller revenue attribution      | Referral → pipeline → closed-won, beyond the minimal version                                                                                                                                                                                                                                                                                                 |
| Pricing                         | ~$200/month per AE/AM seat is an unvalidated hypothesis. Tiers, seat definitions and contract structure all open. No billing in the MVP, so this blocks nothing yet                                                                                                                                                                                          |
| Brand                           | **Pending the business lead.** Logo, palette and slogan all open; explored but not final: deep navy / near-black, vibrant green, off-white. Placeholder tokens sit in `src/app/globals.css` and are used nowhere, and the UI is built against shadcn's role tokens so a palette arriving later is a one-file edit. `docs/brand-brief.md` is the specific ask |
| Initial customer segment        | Affects go-to-market, not the build                                                                                                                                                                                                                                                                                                                          |
| Competitive positioning         | Needs real market research                                                                                                                                                                                                                                                                                                                                   |
| Rep self-verification default   | Which way a _new_ business should default is settled (require approval), but whether onboarding should present this as one choice or two is a UX call                                                                                                                                                                                                        |

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

**2026-11-13 — Task 12.5: the business side can drive the loop, and invites can be claimed.**
Added to the plan after Task 12 found the business-side pages missing. Building it found a second,
larger gap: **no route in the app called `claimInvite`**, so an invited advocate had no way to
become one in a browser. `/invite/[token]` closes that.

Decisions:

- **Claim on POST, never on GET.** The page previews; accepting is a button. Link scanners and
  prefetchers would otherwise consume the single-use token before the person arrived.
- **A signed-in user whose email differs from the invited address may still accept**, with a notice
  saying which account the invite will be linked to. The token is the credential — matching on email
  is exactly what the rebuild refuses to do — and people use work and personal addresses
  interchangeably. The notice is there so nobody attaches the wrong account by accident.
- **Invite links are copied by hand until Task 14** sends email. The link is shown once, because only
  its hash is stored; "New link" re-issues it.
- **Quest moves are verbs (`send | verify | award | cancel`), and the buttons offered are derived from
  `canTransition`**, so the UI cannot drift from the state machine.
- **Influenced revenue is entered in dollars** — how people think about deal size — and anything that
  is not an exact number of cents is refused rather than rounded.
- **Cancelling asks for confirmation**; it is terminal and sits beside buttons that are not.

The **`NEXT_PUBLIC_APP_URL`** action item now matters: invite links are built from it and fall back to
`http://localhost:3000`, which is right for local work and wrong anywhere else.

**2026-11-13 — Task 12: dashboard and settings, and a gap in the plan.**
`/app` is now a dashboard (what is waiting, what advocacy has been worth, the quest pipeline, who is
owed what) and `/app/settings` edits the approval policy. Numbers come from a new `analytics`
module, tenant-scoped and tested against fixtures built through the real state machine.

Decisions made along the way:

- **Influenced revenue counts only `VERIFIED` and `REWARDED` quests.** An admin can cancel a
  verified quest, and its recorded amount should not survive that.
- **A refunded fulfilment nets against "redeemed"**, so a failed Tremendous order does not read as
  extra currency awarded.
- **Money is displayed as whole USD.** No business has a currency of its own; when one does it
  becomes a parameter of `formatCents`.
- **Reps can read the settings page but not change it.** The plan said "unreachable for a REP"; read
  as "a rep cannot change it", because the policy decides whether a rep's own actions wait for
  sign-off and hiding it only makes the buttons confusing. The change itself is refused in the
  service, which a test has covered since Task 5.

**Resolved by Task 12.5 — the business side could not create anything yet.** `/app/advocates` and `/app/quests` are
still the placeholders from the design pass: the services behind them (invite, create, publish,
verify with a revenue amount, reward) are done and tested, but there is no page to drive them. No
task in the plan builds them — Tasks 6 and 7 were service-layer, and 12 and 13 are dashboards — yet
the plan's end-to-end walk depends on them. Until they exist, the dashboard can only show seeded
data. Proposed: a Task 12.5 for those two pages before Task 13.

**2026-11-12 — Task 11: redemption, and the write skew a re-read does not catch.**
The loop closes: an advocate claims, an admin decides, and the debit is written in the same
transaction as the status change.

The plan said "`approveRedemption` re-reads the balance inside the transaction", and that alone is
not enough. Two admins approving two _different_ redemptions for the same advocate touch different
rows, so the status compare-and-swap sees no conflict and the `(redemptionId, reason)` unique index
sees two distinct keys; at READ COMMITTED both transactions read the same balance and both insert.
A balance of 10 pays out twice. The fix is a `SELECT … FOR UPDATE` on the advocate row taken before
the balance is read, which makes the read-then-write window exclusive. **Credits take no lock on
purpose** — they only raise the balance, so a concurrent credit can make the check conservative but
never wrong. The test holds the first approval's transaction open after it has written and runs the
second against the uncommitted debit; mutating the lock away fails it, which is the only way to know
the lock is the thing doing the work rather than luck.

Mutation testing also found the **status compare-and-swap unreachable while that lock holds** — the
pre-check catches every second attempt first. Kept, because it costs nothing and still guards the
status if the lock is ever removed, but recorded as not load-bearing so nobody later writes a test
asserting that it is. Thirteen of fourteen mutations were caught; that one is the exception, and it
is deliberate.

**Decided: approval is admin-only, always.** `requireAdminApprovalForRewards` does not govern it.
That flag is about a rep _awarding_ currency within a budget the business has already set; a
redemption is the business spending real money on a prize it then has to buy and post. "Manual, never
automatic" plus the safe-default principle both point the same way, and no customer has asked for
the looser rule.

**`getAvailableBalance` is a courtesy, not a guard.** Balance less whatever is already `REQUESTED`,
so three 10-cost asks against a balance of 10 do not each look affordable and leave an admin to
decline two. It is not transactional and two simultaneous requests can still get past it — which is
exactly the state the approval path is tested against.

Fulfilment is a status change and an optional order reference. Dealio moves no money and holds no
float, so there is nothing else for it to be until Tremendous lands.

**2026-11-12 — Two bugs on the sign-in page, and next-themes replaced.**
Reported from the browser console, which is the only place either would have shown up.

**The sign-in page crashed on every visit.** It built the Supabase callback URL from
`window.location.origin` at the top of a client component body, and a client component still
renders on the server — `"use client"` means "ships to the browser too", not "browser only". It had
been broken since Task 4 and nobody noticed, because the invite links used in testing go straight
to `/auth/callback` and never touch `/sign-in`. The URL is now built inside the handlers, which
only run in a browser. A reminder that "the auth flow works" was evidence about one path, not the
page.

While there: the page's inputs were hand-rolled with a comment saying `ui.shadcn.com` was outside
the allowed network domains. That has not been true for some time, so they are real `Input` and
`Label` components now.

**`next-themes` is gone.** It renders its no-flash script as a `<script>` element inside a client
component, which React 19 warns about on every client render; the issue is known upstream
(pacocoursey/next-themes#385, #387) with no fix and no release in over a year. The suggested
workarounds were third-party forks, which is a worse trade on the first-paint path than fifty lines
we understand. Ours injects the script with `useServerInsertedHTML` — the App Router's own
mechanism for exactly this — and reads the stored choice with `useSyncExternalStore`, which has a
real server snapshot rather than a hydration guess.

One subtlety worth keeping: when the OS flips while "system" is selected, the stored value does not
change, so `getSnapshot` returns the same string and React re-renders nothing. The class still has
to move, so the subscription applies it directly. Same for a `storage` event from another tab.

Verified in the browser in dev mode, where those React warnings actually fire: the form renders,
the theme sets and persists, a fresh page already carries it, and the console is empty.

**2026-11-12 — Task 10: the reward catalog.**
Per-business CRUD, admin-only to change and rep-readable, with `/app/rewards` to manage it and
`/advocate/rewards` to browse it.

Nothing deletes a reward. A redemption references the reward it was made against and Postgres
refuses to drop a referenced row, so a delete would only ever succeed for rewards nobody wanted —
`setRewardActive(false)` is the real operation. Withdrawn rewards stay listed and dimmed rather
than vanishing, because a business that withdrew one has not deleted it and should be able to put
it back. For the same reason there is no uniqueness constraint on the name: withdrawing "Coffee
voucher" and adding a new one later is ordinary.

Re-pricing is safe because a `Redemption` snapshots both `cost` and `rewardName` when it is
requested — the decision made back in the prototype skim, now load-bearing.

An advocate only ever sees active rewards, whatever `includeInactive` says; the flag is the
business's own view of its own catalog. All four of those guards were mutation-tested.

`soleBusinessActor` joins `soleTenantContext`: the one membership, or a refusal that distinguishes
"none" from "several". Guessing between two memberships would silently act on the wrong company,
and the two cases need different things said to the person — one is waiting for an invitation, the
other for a feature.

The advocate's reward card states the gap rather than greying out what they cannot afford. "Twelve
more and this is yours" is a reason to do another quest; a disabled card is only a refusal, and
that gap being visible is what the product runs on.

**2026-11-12 — Task 9: the advocate side.**
`/advocate` shows what each business has asked of a person, their balance, and the three responses
their status allows. Composition over the existing services — `getAdvocateDashboard` gathers
`listOpportunities` and `getBalance`, both of which already scope an advocate to their own rows.

The server action is where the new security surface is. `businessId` arrives from the form, which
is safe only because `advocateActor` checks it against the identity resolved from the session;
naming the business explicitly is the documented way to pick a context, since one person can
advocate for several companies. Tested as a composition rather than layer by layer: a claimed
invite through to completed work, a tampered `businessId` for another business, and a signed-up
user who never claimed getting no context at all. The action also exposes `accept | decline |
complete` rather than a target status, so the browser cannot name `REWARDED` — the state machine
would refuse it, but a narrower surface has nothing to refuse.

One dashboard per business, never merged: a balance earned at one company cannot be spent at
another.

Two UI findings. `CardContent` is `flex flex-col`, and `flex-wrap` does not override it — different
properties, so tailwind-merge keeps both and the buttons stacked full width. And finding that
exposed something worse: the style guide's quest card was a hand-written copy that had already
drifted from the real one. Both now render `src/components/app/quest-card.tsx`. A guide showing
markup the app does not use is worse than no guide, so components go in it by reference, never by
copy.

**2026-11-02 — Dark mode ships after all, and a nav bug found by using it.**
Reviewing the shell turned up a real defect: the Dashboard tab stayed highlighted on every page,
alongside whichever tab was actually current. A `startsWith` check is wrong as soon as one href
prefixes another, and `/app` prefixes all four sub-pages. Now longest-match, extracted to
`src/components/nav/active.ts` with eight tests — nav highlighting looks too trivial to test right
up until it is wrong on every screen. The wordmark also now returns to the audience's own home
rather than the marketing page, which is the "way back to the dashboard" the tab was failing to be.

Dark mode was previously decided as token-ready but not shipped; the user asked for a toggle, so it
ships: Light/Dark/System via `next-themes`, persisted, with no flash on first paint. Verified in a
real browser rather than reasoned about — the class changes, survives a reload, and a freshly opened
page already carries it.

Building it exposed a flaw in the style guide. It rendered everything twice, light and dark side by
side, which worked only while there was no global theme. With one, the "light" pane cannot escape
the ancestor `.dark` — the variant is `&:is(.dark *)`, so there is no light island — and it silently
went dark while still being labelled Light. The pairs were a workaround for the missing toggle, so
they are gone: the guide renders once and the toggle drives it, which is both simpler and honest
about what the app does.

**2026-11-02 — The design pass: a shell, a style guide, and a lint rule.**
Built between Tasks 8 and 9 so the UI tasks are composition rather than invention.

`/design` renders every token and component light and dark, side by side, so the design can be
reviewed by using it. That immediately earned itself: the first version of the status tokens lived
in `@theme`, with fixed values, and "Rewarded" was invisible in dark mode. A fixed colour cannot be
legible on both a white and a near-black background — anything that must read across themes belongs
under `:root` and `.dark` with the other theme-responsive variables. No amount of reading the code
would have shown that.

Dark mode is previewed rather than shipped: `.dark` is applied to a container on the style guide and
nowhere else, with no toggle and no `next-themes`. That keeps the tokens exercised instead of
rotting as dead config, without doubling the review surface for an MVP whose palette is undecided.
`sonner` was kept for toasts and its generated wrapper patched to drop the `next-themes` dependency.

The theme-neutral promise is now a lint rule rather than a convention: `no-restricted-syntax`
rejects literal colours in `className` and `style`, including inside `cn()` and template literals,
with `src/components/ui/**` exempt because the CLI overwrites it. Verified against a probe
containing four violations and three legitimate lines.

Two findings worth keeping. shadcn's `base-vega` style is on Base UI, which has no `asChild` — use
`buttonVariants` for a link that looks like a button. And Next 16's typed routes only bind once a
build has written the manifest, so a stale one gives false errors locally while a fresh checkout is
permissive; the build step in CI is what actually catches a bad `href`.

The nav links only to pages that exist, because typed routes refused otherwise — which is how the
information architecture got stubbed: `/app/{advocates,quests,rewards,settings}` and
`/advocate/rewards` are real pages saying what is and is not built behind them.

**2026-11-02 — Task 8: the ledger, and currency that cannot move without it.**
`VERIFIED → REWARDED` now credits the advocate in the same transaction as the status change, so a
reward cannot read as paid without the row that pays it. Crediting is a consequence of that status
and never a route to it — `creditForOpportunity` refuses an opportunity in any other state, which
keeps the state machine the only way currency starts moving.

Idempotency is the database's job, not the service's: the unique index on `(opportunityId, reason)`
means a retry, a double-click or a second server gets P2002, and the service treats that as the
normal "already credited" path. A test inserts the duplicate directly, bypassing every service, to
confirm the guarantee does not depend on the check above it.

`inTransaction` was added to `src/server/db.ts` so services can compose atomically whether or not
the caller already opened a transaction. Writing its test taught the lesson worth keeping: the
first version passed a transaction client in, which exercises only the join, and stayed green when
the helper was mutated never to open one. Both branches now have their own test.

Three of the first tests were wrong in an instructive way — they used `deleteMany` and `updateMany`
on `ledger_entries` to arrange state, which the append-only trigger refuses. The tests were trying
to do the exact thing the invariant forbids. Arranging a rewarded-but-uncredited opportunity now
goes through raw SQL on `opportunities`, which is honest about being a state no service can produce.

Also added `getOutstandingLiability`: the sum of a business's ledger. The product brief asks for it
and the prototype could not compute it at all, because a mutable balance column has no history to
sum.

**2026-11-02 — The MVP is built theme-neutral; the palette lands last.**
Confirmed with the user. The interface is built against shadcn's role tokens and the theme is
swapped once, before shipping, when the business lead supplies a palette. That only works if no
component ever contains a literal colour, so that is now a convention in CLAUDE.md, and the
intention is to make it lint-enforced during the design pass rather than leave it to attention.

**2026-11-02 — A design pass goes before the UI tasks, and brand waits for the business lead.**
Asked whether the UI tasks carried any design analysis; they did not. The plan specifies them purely
in terms of data and permissions, and the actual state turned out to be thinner than that implies:
shadcn's `neutral` default palette, which is pure greyscale; the three sketched `brand-*` tokens
referenced by no file at all; one shadcn component installed (`button`); no layout shell, so each
page carries its own ad-hoc width; and a `.dark` token block that is wired in config but never
applied, which is worse than absent because it looks supported.

Two decisions. **Brand waits** — palette, logo and slogan come from the business lead, so nothing
brand-bearing gets invented in the meantime; the build stays on shadcn's role tokens, which is what
makes a late palette a one-file edit. `docs/brand-brief.md` is the concrete ask, including the
contrast constraint that usually rules out a vivid green as a primary button colour.

And **the design pass is its own step**, between Task 8 and Task 9: app shell for both audiences,
the shadcn components all three UI tasks need, a decision on dark mode either way, and the
prototype's layouts reviewed as reference. The alternative was letting the design system emerge from
whatever the first screen happened to need, which is how it becomes unchangeable without anyone
choosing it.

**2026-11-02 — Task 7: opportunities and the lifecycle state machine.**
`transitions.ts` holds every legal edge and its guard as one table; an edge that is not in the table
does not exist, so there is no default-allow. `transitions.test.ts` asserts all 768 combinations of
(from, to, actor, policy) against a specification written out longhand rather than derived from that
table — deriving it would only prove the code equals itself.

Decisions worth keeping. Verification and rewarding share one guard
(`requireAdminApprovalForRewards`): verification is the factual claim that justifies the payout, so
letting a rep verify while reserving the reward for an admin would make the admin a rubber stamp.
Ownership is two separate flags, `isCreator` and `isAssignedAdvocate`, because a rep owning an
opportunity and an advocate owning one are different relationships that share a word, and one
boolean is how an advocate passes a check written for a rep. `VERIFIED → CANCELLED` is admin-only
and is the last clean exit, since no currency has moved; after `REWARDED` the only correction is an
appended ledger adjustment.

Creating and publishing stay separate even for a rep allowed to publish, because the policy can
change in between and the transition is where it is read. An advocate may decline after accepting —
someone who said yes and then cannot deliver needs a way to say so.

Prisma accepts a non-unique field in `update`'s `where`, which turns the status change, its
timestamp and its `OpportunityEvent` into one atomic nested write carrying its own compare-and-swap.
A concurrent second attempt gets P2025 and a conflict rather than overwriting the first; the held-lock
technique from Task 6 covers it.

All six guards were mutation-tested with assertions that the mutation applied: authority, legal-edge
shape, the compare-and-swap, advocate scoping, tenant scoping, and the influenced-revenue
restriction. Each is caught by at least one test.

**Not finished:** `VERIFIED → REWARDED` writes no ledger entry yet. That is Task 8, and until then
the status is not evidence of payment.

**2026-11-01 — Auth confirmed end to end against the live project.**
The last unverified link in Task 4 and Task 5. `provisionAuthUser` really does create a Supabase
auth user, and a link it mints really does sign someone in. Nothing in the flow needed changing.

Two output problems surfaced instead, both now fixed: the scripts claimed "auth user created" even
when they had reused an existing one, and they printed a set-password link under wording that read
as though it had been emailed. Neither was a logic bug and both wasted someone's time, which is the
argument for treating script output as part of the interface rather than as logging.

Worth knowing for later: `--send` only mails a link for an address Supabase has not seen before.
For an existing auth user, `inviteUserByEmail` reports `email_exists`, so we fall back to minting a
link and printing it. The reliable way to get a real email today is the magic link on `/sign-in`,
which goes through `signInWithOtp`. Proper sending is Task 14.

**2026-11-01 — Task 6: advocates — invite, claim, list.**
`inviteAdvocate` creates the `Advocate` and a hashed single-use token, returning the plaintext once;
`claimInvite` links a signed-in user to that record; `listAdvocates` is staff-only. 25 integration
tests.

`claimInvite` takes a `Db` and a `userId`, not a `ServiceContext` — the claimer has no tenant
context yet, and requiring one would be circular. **The token is the only accepted proof.** The
original plan allowed an email-match fallback when Supabase reported the address verified; that was
closed off earlier and this follows the later decision, because email confirmation is currently off
in development and a fallback is exactly what would make that setting load-bearing again.

Tokens are SHA-256, not bcrypt or argon2: stretching protects _chosen_ secrets, and this is 256 bits
of CSPRNG output with nothing to guess. Re-inviting expires the previous link so only the newest
works, mirroring Supabase's own one-token-per-type behaviour. Re-inviting a deactivated advocate is
refused rather than silently reactivating them.

The useful lesson came from the tests. A race test that fired two claims with `Promise.all` on one
client passed even with **both** compare-and-swaps replaced by plain writes — the transactions were
serialised, so it proved nothing. Two clients made them genuinely overlap but still did not produce
the dangerous interleaving, because whichever read second saw the committed result and stopped at an
ordinary pre-check. What works is holding an uncommitted write on the row from a second connection:
the operation under test reads the old value, blocks on the lock, and the conditional update is then
the only thing that can catch it. Both compare-and-swaps now have one such test each and both fail
without their guard.

Two of those findings were briefly wrong, because a search-and-replace mutation silently missed
after Prettier rewrapped a line and the script reported success anyway. Mutation tests now assert
that the mutation applied. Recorded because a guard wrongly believed to be tested is worse than one
known to be untested.

**2026-11-01 — Task 5: businesses, memberships and onboarding scripts.**
The `tenancy` module: `createBusiness` (platform staff only, business and first admin in one
nested write), `addMember`/`listMembers`, `getApprovalPolicy`/`updateApprovalPolicy`,
`grantPlatformStaff` and `resolvePlatformStaffActor`. 45 integration tests, and every authority
guard was verified load-bearing by removing it and watching exactly one test fail.

Four decisions worth recording. `addMember` takes no `businessId` — it comes from the actor, so
"add a member to a business I do not administer" is not a request that can be expressed, which
beats validating a caller-supplied id. `listMembers` and `getApprovalPolicy` require a _business_
actor rather than any tenant context, because an advocate carries the same `businessId` as the
reps and would otherwise be able to enumerate the sales team. `getApprovalPolicy` is readable by a
rep, since the UI has to explain whether their action will wait for sign-off, while
`updateApprovalPolicy` is admin-only: a rep who could delegate authority to reps would be granting
it to themselves. And `resolvePlatformStaffActor` refuses rather than guessing between two staff
members, mirroring `soleTenantContext` — the record of who onboarded a business is its only audit
trail.

The scripts are thin by construction. Their one untestable act is calling Supabase's admin API, so
everything after it lives in `services/tenancy/onboard.ts` where tests cover it, including that a
slug collision inside the wrapping transaction leaves no orphaned `User` able to sign in to
nothing. **`provisionAuthUser` itself is unverified** — running it would create a user in the live
project, which this sandbox cannot reach a database from anyway.

Two things found on the way. Scripts need `tsx --conditions=react-server`, because `server-only`
throws under node's default resolution; without it every script that touches the database dies on
import. And `generateLink({ type: "invite" })` creates the user when absent and returns the link
without sending it, which Supabase's reference confirms — though there are upstream reports of it
refusing instead, noted in the code since the fallback only covers the already-registered case.

Links are printed rather than emailed by default, a deliberate deviation from the plan's "sends a
set-password link": Supabase's built-in SMTP allows a handful of messages an hour and our own
sending is Task 14. `--send` asks Supabase to mail it.

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
