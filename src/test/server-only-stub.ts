/**
 * Stands in for the `server-only` package when tests import a server module.
 *
 * `server-only`'s real entry point throws unless resolved under the
 * `react-server` condition, which is what Next sets for server components. In
 * tests nothing sets it, so importing `@/server/db` as a value — which any
 * service that opens a transaction now does — would fail at import time with
 * "cannot be imported from a Client Component".
 *
 * Aliasing the one package is deliberate. Setting `react-server` globally for
 * the test run was tried first and broke unrelated dependencies that ship a
 * different build under that condition. The marker's job is to fail a *browser*
 * bundle, and `next build` still enforces that for real.
 */
export {};
