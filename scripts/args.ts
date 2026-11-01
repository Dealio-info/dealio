/**
 * Command-line parsing for the onboarding scripts.
 *
 * Separate from `_shared.ts` so it stays pure and unit-testable: `_shared.ts`
 * reaches Supabase and loads `.env`, which a unit test should not.
 */

export type Args = Record<string, string | true>;

/**
 * Parse `--key value` and bare `--flag`.
 *
 * A `--key` followed by another `--key` is a flag, not a key with a value, so
 * `--send --email x` does the obvious thing. Unknown keys are ignored here and
 * validated by the caller, which knows its own usage string.
 */
export function parseArgs(argv: readonly string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined || !token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "") continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function optionalArg(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function flag(args: Args, key: string): boolean {
  return args[key] === true || args[key] === "true";
}

/** A usage problem, not a crash. `reportAndExit` prints these without a stack. */
export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgError";
  }
}

/** Read a required option, or raise a usage error naming it. */
export function requireArg(args: Args, key: string): string {
  const value = optionalArg(args, key);
  if (value === undefined) {
    throw new ArgError(`Missing --${key}`);
  }
  return value;
}
