// Vitest does not put `.env` into `process.env`, so load it here the same way
// `prisma.config.ts` does. dotenv never overrides an already-set variable, so
// CI (which supplies TEST_DATABASE_URL directly) is unaffected.
import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration tests: real Postgres, no DOM, run serially.
 *
 * Kept separate from `vitest.config.ts` so `npm test` stays fast and needs no
 * database. Anything touching Prisma belongs here; pure logic belongs in the
 * unit suite.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./src/test/integration/global-setup.ts"],
    // The harness truncates shared tables between tests, so parallel files
    // would race each other. Correctness over speed.
    fileParallelism: false,
    sequence: { concurrent: false },
    // Migrations on a cold database can take a moment.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // See src/test/server-only-stub.ts: the real `server-only` throws unless
      // resolved under the `react-server` condition, which nothing sets here.
      "server-only": path.resolve(
        import.meta.dirname,
        "./src/test/server-only-stub.ts",
      ),
    },
  },
});
