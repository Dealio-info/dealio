import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 keeps connection URLs out of `schema.prisma`. The CLI (migrate, db
 * pull, studio) reads them from here; the runtime client gets its connection
 * from the driver adapter in `src/server/db.ts` instead.
 *
 * `DIRECT_URL` is used when set because migrations must not run through a
 * connection pooler. Supabase hands you both: a pooled URL on port 6543 for
 * the app and a direct one on 5432 for schema changes.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
