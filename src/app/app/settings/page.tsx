import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { isBusinessAdmin, soleBusinessActor } from "@/server/context";
import { getApprovalPolicy } from "@/server/services/tenancy/approval-policy";
import { PageHeader } from "@/components/app/page-header";
import { capitalize, TERMS } from "@/lib/terms";
import { CURRENCY } from "@/lib/currency";
import { PolicyForm, type PolicySetting } from "./policy-form";

export const metadata = { title: "Settings · Dealio" };

/**
 * The same trade-off the onboarding conversation presents, in the same terms:
 * sign-off is safer because the currency is worth real money, delegating is
 * faster because reps stop waiting on an admin. Each line describes the
 * switch's *current* position, so reading the page tells you what is true.
 */
const SETTINGS: readonly PolicySetting[] = [
  {
    name: "requireAdminApprovalForOpportunities",
    label: `An admin approves ${TERMS.quest.many} before they are sent`,
    on: `A rep's new ${TERMS.quest.one} waits for an admin to approve it before the ${TERMS.advocate.one} sees it. Slower, but nothing goes out in the company's name unseen.`,
    off: `Reps send ${TERMS.quest.many} straight to ${TERMS.advocate.many}. Faster; admins see them afterwards rather than before.`,
  },
  {
    name: "requireAdminApprovalForRewards",
    label: `An admin approves before ${CURRENCY.many} are awarded`,
    on: `When a ${TERMS.quest.one} is done, an admin verifies it and awards the ${CURRENCY.many}. ${capitalize(CURRENCY.many)} turn into ${TERMS.reward.many} you pay for, so this is the safer default.`,
    off: `Reps verify completed ${TERMS.quest.many} and award ${CURRENCY.many} themselves. ${capitalize(TERMS.advocate.many)} are paid sooner; you trust reps with the budget.`,
  },
];

export default async function SettingsPage() {
  const identity = await requireIdentity();
  const actor = soleBusinessActor(identity);
  const policy = await getApprovalPolicy({ db: prisma, actor });
  const editable = isBusinessAdmin(actor);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description={
          editable
            ? "Who signs off before things happen. Changes apply from the next action — anything already sent or paid stays as it is."
            : "Who signs off before things happen. Only an admin can change these; this is what is currently in force."
        }
      />
      <section className="bg-card max-w-3xl space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold tracking-tight">Approvals</h2>
        <PolicyForm
          settings={SETTINGS}
          initial={{
            requireAdminApprovalForOpportunities:
              policy.requireAdminApprovalForOpportunities,
            requireAdminApprovalForRewards: policy.requireAdminApprovalForRewards,
          }}
          editable={editable}
        />
        <p className="text-muted-foreground border-t pt-4 text-sm">
          Approving a redemption is always an admin&rsquo;s decision, whatever these
          say: it is the point where the business spends real money.
        </p>
      </section>
    </div>
  );
}
