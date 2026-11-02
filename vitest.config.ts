import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `scripts/` too: the onboarding scripts' pure parts (argument parsing)
    // are worth testing, and leaving them out would quietly mean "untested".
    include: ["{src,scripts}/**/*.{test,spec}.{ts,tsx}"],
    // Integration tests live in `vitest.integration.config.ts`. They need a
    // real database and a global setup, and `*.integration.test.ts` also
    // matches the include pattern above, so exclude them explicitly or
    // `npm test` tries to load them and fails.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
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
