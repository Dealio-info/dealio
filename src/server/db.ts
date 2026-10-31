import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

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
