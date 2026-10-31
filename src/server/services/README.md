# Services

All business rules live here. This directory and `../db.ts` are the only places allowed to
import `@prisma/client` — enforced by `no-restricted-imports` in `eslint.config.mjs`.

Conventions, once Task 3 lands the tenant context:

- Every exported function takes a `TenantContext` as its **first** argument, and scopes every
  query by `context.businessId`. Never accept a `businessId` from the caller's request body.
- Authority is decided here, not by the caller. For the per-business approval policy, read the
  flags from the `Business` row inside the same transaction as the transition.
- Modules own their own tables and don't reach into another module's queries: `tenancy`,
  `identity`, `advocates`, `opportunities`, `rewards`, `analytics`.
- Anything that moves currency does so in one transaction, writing a `LedgerEntry` row. There is
  no code path that updates or deletes a ledger row.

Route handlers and server actions stay thin: validate input with Zod, call a service, return.
