import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Integration-test harness: a Prisma client pointed at a throwaway database,
 * plus a reset between tests.
 *
 * This is one of the few places outside `src/server/**` allowed to construct a
 * Prisma client (see the allowlist in eslint.config.mjs). Test code never ships
 * to the browser, so it does not weaken the rule that the browser cannot reach
 * the database — but service tests should still go through service functions
 * rather than reaching past them with this client.
 */

/**
 * Deliberately a separate variable from `DATABASE_URL` so a misconfigured run
 * can never truncate a development or production database.
 */
export function testDatabaseUrl(): string {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests need their own throwaway " +
        "database — see README. Refusing to fall back to DATABASE_URL.",
    );
  }
  if (url === process.env["DATABASE_URL"]) {
    throw new Error(
      "TEST_DATABASE_URL must not equal DATABASE_URL. The harness truncates every " +
        "table between tests.",
    );
  }
  return url;
}

let client: PrismaClient | undefined;

/** The harness client. Created once per worker. */
export function testPrisma(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
  });
  return client;
}

export async function disconnectTestPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/**
 * Empty every table, preserving the schema and Prisma's migration history.
 *
 * The table list is read from the database rather than hardcoded so it cannot
 * rot as the schema grows.
 *
 * Note this uses TRUNCATE, which the `ledger_entries` append-only trigger does
 * not block — that trigger is `FOR EACH ROW` on UPDATE and DELETE, and TRUNCATE
 * is neither. That is intentional: the rule exists to stop a service rewriting
 * currency history, not to stop a test resetting its own database. Do not
 * "harden" it into a statement-level trigger without replacing this reset.
 */
export async function resetDb(): Promise<void> {
  const prisma = testPrisma();
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

/**
 * A second Prisma client with its own connection pool.
 *
 * For concurrency tests only. Two `$transaction` calls on the *same* client do
 * not reliably interleave — the adapter may serialise them, so a test that
 * fires both with `Promise.all` can pass against code with no concurrency
 * protection at all. Discovered the hard way: a claim-invite race test stayed
 * green after both of its compare-and-swaps were replaced with plain writes.
 *
 * Separate pools give genuinely concurrent transactions. The caller owns the
 * client and must disconnect it.
 */
export function separateTestPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
  });
}
