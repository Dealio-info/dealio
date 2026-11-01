-- Close Supabase's second door to the database.
--
-- Supabase runs PostgREST over the `public` schema and grants the `anon` and
-- `authenticated` roles access to it by default. Tables created by our own
-- migrations inherit that, so after the first deploy every table was readable
-- over HTTPS by anyone holding the publishable key — which is public by design
-- and ships in the browser bundle. Verified: `GET /rest/v1/businesses` returned
-- 200 with the publishable key alone.
--
-- That is the prototype's defect arriving through a different door. Our whole
-- architecture rests on the browser being unable to reach the database, and the
-- ESLint boundary only governs *our* code; it says nothing about a REST API
-- Supabase stands up beside it.
--
-- This is NOT a reversal of the decision to enforce tenancy in the service
-- layer rather than with RLS. RLS here is a deny-all lock on a door we never
-- use, not the mechanism that scopes tenants. There are deliberately no
-- policies: RLS enabled with zero policies denies everything to non-owner
-- roles, while the table owner — the role Prisma connects as — bypasses RLS and
-- is unaffected.

-- 1. Deny-all RLS on every application table.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "advocates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "advocate_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "redemptions" ENABLE ROW LEVEL SECURITY;

-- 2. Remove the grants themselves, so the tables are not merely empty through
--    PostgREST but absent from it. Belt and braces: either measure alone would
--    do, and a future migration that forgets one is still covered by the other.
--
--    Guarded because `anon` and `authenticated` are Supabase roles that do not
--    exist on a plain Postgres, which is what the test harness runs against.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', r);
      -- Future tables, too.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;
