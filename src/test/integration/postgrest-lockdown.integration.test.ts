import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectTestPrisma, resetDb, testPrisma } from "./harness";
import { makeBusiness } from "./fixtures";

/**
 * Supabase stands up PostgREST over the `public` schema and grants `anon` and
 * `authenticated` access to it by default. Tables our migrations create inherit
 * that, so after the first deploy every one of them was readable over HTTPS by
 * anyone holding the publishable key — which is public by design and ships in
 * the browser bundle. That was verified against the live project before the
 * `lock_out_postgrest` migration was written.
 *
 * The ESLint boundary cannot see this. It governs our code's imports; it says
 * nothing about a REST API Supabase runs beside us. So the lock gets a test
 * instead, and its job is to fail when someone adds a table and forgets.
 *
 * Two things this is not:
 *
 *  - It is not tenancy. Tenancy is enforced in the service layer. RLS here is a
 *    deny-all lock on a door we never open, which is why there are deliberately
 *    no policies.
 *  - It is not a check that Supabase is configured correctly. It asserts what
 *    our committed migrations do, on any Postgres. Confirming the live project
 *    is locked down is a deploy step, not a test.
 */

const prisma = testPrisma();

/**
 * Prisma's own bookkeeping table. It is covered by the REVOKE half of the
 * migration but we do not ALTER a table we did not create, so RLS is off on it.
 */
const NOT_OURS = ["_prisma_migrations"];

async function appTables(): Promise<
  Array<{ relname: string; relrowsecurity: boolean }>
> {
  const rows = await prisma.$queryRaw<
    Array<{ relname: string; relrowsecurity: boolean }>
  >`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `;
  return rows.filter((r) => !NOT_OURS.includes(r.relname));
}

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

describe("PostgREST lockdown", () => {
  it("enables row-level security on every application table", async () => {
    const tables = await appTables();

    // Guard against the assertion passing because the query found nothing.
    expect(tables.length).toBeGreaterThanOrEqual(11);

    const unlocked = tables.filter((t) => !t.relrowsecurity).map((t) => t.relname);
    expect(unlocked).toEqual([]);
  });

  it("defines no policies, because the lock is deny-all and not tenancy", async () => {
    const rows = await prisma.$queryRaw<
      Array<{ tablename: string; policyname: string }>
    >`
      SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    `;

    expect(rows).toEqual([]);
  });

  it("does not stop Prisma, which connects as the table owner", async () => {
    // Owners bypass RLS, so the lock costs us nothing. If this ever fails, the
    // application role has been changed and the lock needs policies or a
    // BYPASSRLS grant — not to be switched off.
    const business = await makeBusiness();
    const read = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });

    expect(read.id).toBe(business.id);
  });
});
