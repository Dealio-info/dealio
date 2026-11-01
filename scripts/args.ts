/**
 * Command-line parsing for the onboarding scripts.
 *
 * Separate from `_shared.ts` so it stays pure and unit-testable: `_shared.ts`
 * reaches Supabase and loads `.env`, which a unit test should not.
 */

export type Args = Record<string, string | true>;

/** A usage problem, not a crash. `reportAndExit` prints these without a stack. */
export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgError";
  }
}

/**
 * Parse `--key value` and bare `--flag`.
 *
 * A `--key` followed by another `--key` is a flag, not a key with a value, so
 * `--send --email x` does the obvious thing.
 *
 * **A leftover word is an error, not something to ignore.** Forget the quotes
 * around `--name Mike Kamilos` and the shell hands us three tokens; silently
 * taking the first would write a person's name to the database as "Mike" and
 * nobody would notice, because the scripts print the email rather than the
 * name. Refusing costs one retry.
 *
 * Unknown *keys* are still the caller's business — it owns the usage string.
 */
export function parseArgs(argv: readonly string[]): Args {
  const out: Args = {};
  const stray: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith("--")) {
      stray.push(token);
      continue;
    }
    const key = token.slice(2);
    // A bare `--` is the conventional end-of-options marker. npm eats the
    // first one; a second is harmless noise.
    if (key === "") continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  if (stray.length > 0) {
    throw new ArgError(
      `Unexpected argument${stray.length > 1 ? "s" : ""}: ${stray.join(" ")}\n` +
        'If a value contains spaces, quote it: --name "Mike Kamilos"',
    );
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

/** Read a required option, or raise a usage error naming it. */
export function requireArg(args: Args, key: string): string {
  const value = optionalArg(args, key);
  if (value === undefined) {
    throw new ArgError(`Missing --${key}`);
  }
  return value;
}
