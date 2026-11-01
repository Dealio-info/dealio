/**
 * Supabase-facing helpers for the onboarding scripts.
 *
 * These scripts are how Dealio staff bring a tenant into existence. There is
 * deliberately no self-serve signup and no route for any of it: possession of
 * `DATABASE_URL` and the Supabase secret key is the authorization, which is
 * only honest because neither is on the request path.
 *
 * Note what is missing: a Prisma import. Scripts are not on the
 * database-boundary allowlist, so they reach the database through
 * `@/server/db` and the service layer like any other caller.
 *
 * Argument parsing lives in `args.ts`, which stays pure so it can be
 * unit-tested. What is left here is the one thing no test should do — call
 * Supabase's admin API — so keep this file as thin as it is.
 */
import "dotenv/config";

import { ServiceError } from "@/server/context";
import { supabaseAdmin } from "@/server/supabase-admin";
import { ArgError } from "./args";

export function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/**
 * Print the errors a user can act on, and let a real bug stack-trace.
 */
export function reportAndExit(usage: string) {
  return (error: unknown): never => {
    if (error instanceof ArgError) {
      fail(`${error.message}\n\n${usage}`);
    }
    if (error instanceof ServiceError) {
      fail(`${error.code}: ${error.message}`);
    }
    throw error;
  };
}

export type ProvisionedAuthUser = {
  readonly supabaseUserId: string;
  readonly email: string;
  /** Where the person goes to set a password. Undefined when none was minted. */
  readonly actionLink: string | undefined;
};

/**
 * Make sure a Supabase auth user exists for this email, and mint a link they
 * can use to set a password.
 *
 * The link is **printed rather than emailed** by default. Supabase's built-in
 * SMTP is rate-limited to a handful of messages an hour and is not meant for
 * real delivery, and our own sending arrives with Resend in Task 14. Until
 * then printing is the reliable path: it needs no SMTP configured, and an
 * operator onboarding a pilot customer is at the terminal anyway. Pass
 * `--send` to ask Supabase to email it instead.
 *
 * Supabase's admin API has no look-up-by-email, which is why the
 * already-exists case falls through to a recovery link: it is also how we
 * learn their auth id.
 *
 * It deliberately does **not** report whether the auth user was created or
 * already existed. `generateLink({ type: "invite" })` succeeds for an existing
 * unconfirmed user and returns them, so the create and reuse paths are
 * indistinguishable from the response — an earlier version claimed "created"
 * every time, which was simply wrong. The admin API offers no reliable signal
 * (`created_at` would need a trustworthy shared clock, and an unconfirmed user
 * looks the same either way), so the scripts print the auth id and say nothing
 * they cannot stand behind.
 *
 * One consequence worth knowing: Supabase stores one token per type per user,
 * so minting a link replaces any earlier one for that person. The newest link
 * is the only one that works.
 */
export async function provisionAuthUser(input: {
  readonly email: string;
  readonly name?: string | undefined;
  readonly redirectTo: string;
  readonly send: boolean;
}): Promise<ProvisionedAuthUser> {
  const supabase = supabaseAdmin();
  const metadata = input.name ? { name: input.name } : undefined;

  if (input.send) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: input.redirectTo,
      ...(metadata && { data: metadata }),
    });
    if (!error && data.user) {
      return {
        supabaseUserId: data.user.id,
        email: input.email,
        actionLink: undefined,
      };
    }
    if (error && !isAlreadyRegistered(error)) {
      fail(`Supabase could not invite ${input.email}: ${error.message}`);
    }
  }

  // `invite` creates the user when they do not exist, and returns a link
  // without sending anything — Supabase's reference documents both.
  //
  // There have been upstream regressions where `invite` refuses instead of
  // creating (supabase/supabase#22521, #22562). If that resurfaces, this does
  // not silently misbehave: an error that is not "already registered" stops
  // the script with Supabase's own message, and the fix is to create the user
  // with `createUser` and then mint a recovery link.
  const invited = await supabase.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { redirectTo: input.redirectTo, ...(metadata && { data: metadata }) },
  });
  if (!invited.error && invited.data.user) {
    return {
      supabaseUserId: invited.data.user.id,
      email: input.email,
      actionLink: invited.data.properties?.action_link,
    };
  }
  if (invited.error && !isAlreadyRegistered(invited.error)) {
    fail(`Supabase could not create ${input.email}: ${invited.error.message}`);
  }

  const recovery = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
    options: { redirectTo: input.redirectTo },
  });
  if (recovery.error || !recovery.data.user) {
    fail(
      `${input.email} already exists in Supabase but no recovery link could be ` +
        `minted: ${recovery.error?.message ?? "no user returned"}`,
    );
  }
  return {
    supabaseUserId: recovery.data.user.id,
    email: input.email,
    actionLink: recovery.data.properties?.action_link,
  };
}

function isAlreadyRegistered(error: { message: string; code?: string }): boolean {
  return (
    error.code === "email_exists" ||
    /already (been )?registered|already exists/i.test(error.message)
  );
}
