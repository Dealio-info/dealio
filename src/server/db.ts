// Closes a gap the lint boundary cannot see. The ESLint rule blocks importing
// the Prisma client directly, but nothing stopped a client component importing
// *this* module and pulling the client into the browser bundle. `server-only`
// makes that a build error with a clear message.
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The single Prisma instance for the whole app.
 *
 * This file and `src/server/services/**` are the only places allowed to import
 * the Prisma client — enforced by `no-restricted-imports` in eslint.config.mjs.
 * Everything else calls a service function that takes a TenantContext, which is
 * how multi-tenant isolation is guaranteed. See CLAUDE.md.
 *
 * Prisma 7 connects through a driver adapter rather than a `url` in
 * schema.prisma. `DATABASE_URL` should be the pooled connection; migrations use
 * `DIRECT_URL` via prisma.config.ts.
 *
 * Note the connection string is passed without asserting it is set. `pg` only
 * dials on first query, so a missing `DATABASE_URL` fails at the first query
 * with a clear error rather than at module load — which matters because `next
 * build` imports this module in CI, where no database exists.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env["DATABASE_URL"],
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

// Cached on globalThis in development so Next's hot reload doesn't open a new
// connection pool on every edit.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Either the long-lived client or a transaction client.
 *
 * Service functions take a `Db` rather than reaching for the `prisma` singleton
 * directly, for two reasons:
 *
 *  1. **Invariant 1 requires composition inside one transaction.** Currency
 *     moves and the ledger row that records it must be atomic, which means a
 *     service has to be callable as `prisma.$transaction((tx) => …)`. A service
 *     that closed over the singleton could not join a caller's transaction.
 *  2. Integration tests point at a throwaway database, which is not the one the
 *     singleton reads from `DATABASE_URL`.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Run `fn` inside a transaction, joining the caller's if there already is one.
 *
 * Invariant 1 says a currency movement and the ledger row recording it have to
 * be atomic. Composing two services to achieve that runs into the fact that a
 * `Db` may be either a client, which can open a transaction, or a transaction
 * client, which cannot — and Postgres has no nested transactions, so calling
 * `$transaction` on an already-open one is not an option either.
 *
 * So the handle is asked what it is. If it can begin a transaction, it does; if
 * it is already one, `fn` runs in it. Either way `fn` is atomic, which is the
 * only thing the caller needs to be true.
 *
 * The alternative was requiring every caller to remember to wrap — a rule
 * whose only enforcement is reviewer attention, on the code path that moves
 * money.
 */
export function inTransaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return "$transaction" in db ? db.$transaction((tx) => fn(tx)) : fn(db);
}
