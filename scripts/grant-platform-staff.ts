/**
 * Grant someone Dealio-staff status.
 *
 *   npm run grant:staff -- --email you@dealio.info [--name "Your Name"] [--send]
 *
 * Run this once before seeding the first business: `seed-business` acts as a
 * platform staff member and refuses rather than inventing one.
 *
 * Platform staff is its own table, not a role value, and holding it confers no
 * access to any business's data — invariant 6. Conflating the two was the
 * prototype's worst defect: there, every business owner got a global admin flag
 * that also opened Dealio's internal portal and every other customer's records.
 */
import { prisma } from "@/server/db";
import { serverEnv } from "@/lib/env";
import { onboardPlatformStaff } from "@/server/services/tenancy/onboard";
import { flag, optionalArg, parseArgs, requireArg } from "./args";
import { provisionAuthUser, reportAndExit } from "./_shared";

const USAGE = `Usage:
  npm run grant:staff -- --email you@dealio.info [--name "Your Name"] [--send]

  --email  Who to make Dealio staff.
  --name   Optional display name.
  --send   Ask Supabase to email the link instead of printing it.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = requireArg(args, "email");
  const name = optionalArg(args, "name");

  const auth = await provisionAuthUser({
    email,
    name,
    redirectTo: `${serverEnv.appUrl}/auth/callback`,
    send: flag(args, "send"),
  });

  const result = await prisma.$transaction((tx) =>
    onboardPlatformStaff(tx, { supabaseUserId: auth.supabaseUserId, email, name }),
  );

  console.log(`\n${result.alreadyHeld ? "Already" : "Now"} Dealio staff: ${email}`);
  console.log(`  user id      ${result.userId}`);
  console.log(`  supabase id  ${auth.supabaseUserId}`);
  console.log(`  auth user    ${auth.wasCreated ? "created" : "already existed"}`);
  if (auth.actionLink) {
    console.log(`\nSet a password here (single use):\n  ${auth.actionLink}`);
  }
  console.log(
    "\nThis grants no access to any business's data. Next: npm run seed:business\n",
  );
}

main()
  .catch(reportAndExit(USAGE))
  .finally(() => prisma.$disconnect());
