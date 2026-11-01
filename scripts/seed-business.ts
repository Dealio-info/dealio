/**
 * Onboard a business: create it with its first admin, and hand that admin a
 * link to set a password.
 *
 *   npm run seed:business -- --name "Acme Corp" --admin-email ceo@acme.com
 *
 * Replaces the prototype's `create-business-account` edge function, with two
 * deliberate differences. That function granted the new owner a global
 * `user_roles.role = 'admin'`, which also opened Dealio's internal portal and
 * every other customer's records; this creates a `BUSINESS_ADMIN` membership
 * scoped to the one business and nothing more. And this runs as a named
 * platform staff member rather than an anonymous privileged caller, so there is
 * a record of who onboarded whom.
 *
 * The approval policy is set here because it is a conversation you have during
 * onboarding. Both flags default to requiring admin sign-off, since the
 * currency carries real monetary value; the two `--delegate-*` flags hand the
 * respective decision to the business's own reps.
 */
import { prisma } from "@/server/db";
import { slugify } from "@/lib/slug";
import { serverEnv } from "@/lib/env";
import { onboardBusiness } from "@/server/services/tenancy/onboard";
import { ArgError, flag, optionalArg, parseArgs, requireArg } from "./args";
import { provisionAuthUser, reportAndExit } from "./_shared";

const USAGE = `Usage:
  npm run seed:business -- --name "Acme Corp" --admin-email ceo@acme.com [options]

  --name                     The business's display name.
  --admin-email              Its first admin. They get a set-password link.
  --admin-name               Optional display name for that admin.
  --slug                     URL slug. Derived from --name when omitted.
  --delegate-opportunities   Let reps send quests without admin sign-off.
  --delegate-rewards         Let reps award currency without admin sign-off.
  --as <email>               Which Dealio staff member to act as. Only needed
                             when there is more than one.
  --send                     Ask Supabase to email the link instead of
                             printing it.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = requireArg(args, "name");
  const adminEmail = requireArg(args, "admin-email");
  const adminName = optionalArg(args, "admin-name");
  const slug = optionalArg(args, "slug") ?? slugify(name);

  if (slug === "") {
    throw new ArgError(`Could not derive a slug from "${name}". Pass --slug.`);
  }

  const auth = await provisionAuthUser({
    email: adminEmail,
    name: adminName,
    redirectTo: `${serverEnv.appUrl}/auth/callback`,
    send: flag(args, "send"),
  });

  // One transaction: a business, its admin's user row and the admin membership
  // land together. Half of this is worse than none — a user who can sign in
  // and reach nothing looks like a broken product rather than a failed script.
  const result = await prisma.$transaction((tx) =>
    onboardBusiness(tx, {
      supabaseUserId: auth.supabaseUserId,
      adminEmail,
      adminName,
      name,
      slug,
      requireAdminApprovalForOpportunities: !flag(args, "delegate-opportunities"),
      requireAdminApprovalForRewards: !flag(args, "delegate-rewards"),
      actingStaffEmail: optionalArg(args, "as"),
    }),
  );

  const { business } = result;
  console.log(`\nCreated business "${business.name}"`);
  console.log(`  id                     ${business.id}`);
  console.log(`  slug                   ${business.slug}`);
  console.log(`  admin                  ${adminEmail} (user ${result.adminUserId})`);
  console.log(`  onboarded by           staff user ${result.actingStaffUserId}`);
  console.log(
    `  quests need approval   ${business.requireAdminApprovalForOpportunities}`,
  );
  console.log(`  rewards need approval  ${business.requireAdminApprovalForRewards}`);
  console.log(`  supabase auth id       ${auth.supabaseUserId}`);
  if (auth.actionLink) {
    console.log(
      `\nSend the admin here to set a password. Single use, and it replaces ` +
        `any earlier link for this person:\n  ${auth.actionLink}`,
    );
  } else {
    console.log("\nNo link printed — Supabase was asked to email it instead.");
  }
  console.log("");
}

main()
  .catch(reportAndExit(USAGE))
  .finally(() => prisma.$disconnect());
