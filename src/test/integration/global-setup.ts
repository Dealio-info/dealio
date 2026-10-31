import { execFileSync } from "node:child_process";
import { Client } from "pg";

/**
 * Runs once before the integration suite.
 *
 * Creates the throwaway database if it does not exist, then applies migrations
 * with `prisma migrate deploy`. Applying the real migrations — rather than
 * `db push` — means the suite also proves the committed migration history is
 * valid, which is half the point of having integration tests at all.
 */
export default async function setup(): Promise<void> {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start a Postgres and point it at an empty " +
        "database — see README.",
    );
  }

  await ensureDatabaseExists(url);

  // prisma.config.ts reads DIRECT_URL first, so this points the CLI at the test
  // database without touching the developer's own DATABASE_URL.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
  });
}

/**
 * Connects to the `postgres` maintenance database on the same server and
 * creates the target database when missing, so a fresh checkout or a fresh CI
 * runner needs no manual setup step.
 */
async function ensureDatabaseExists(url: string): Promise<void> {
  const parsed = new URL(url);
  const target = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!target) {
    throw new Error(`TEST_DATABASE_URL has no database name: ${url}`);
  }

  const admin = new URL(url);
  admin.pathname = "/postgres";

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [target],
    );
    if (rowCount === 0) {
      // Identifiers cannot be parameterised, so quote it defensively.
      await client.query(`CREATE DATABASE "${target.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}
