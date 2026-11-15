import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { soleBusinessActor } from "@/server/context";
import { listAdvocates } from "@/server/services/advocates/list-advocates";
import { listAdvocateBalances } from "@/server/services/analytics/dashboard";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { CurrencyAmount } from "@/components/app/currency-amount";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { capitalize, TERMS } from "@/lib/terms";
import { InviteAdvocate } from "./invite-form";
import { ReissueButton } from "./reissue-button";

export const metadata = { title: "Advocates · Dealio" };

export default async function AdvocatesPage() {
  const identity = await requireIdentity();
  const ctx = { db: prisma, actor: soleBusinessActor(identity) };
  const [advocates, balances] = await Promise.all([
    listAdvocates(ctx),
    listAdvocateBalances(ctx),
  ]);
  const balanceOf = new Map(balances.map((b) => [b.advocateId, b.balance]));

  return (
    <div className="space-y-8">
      <PageHeader
        title={capitalize(TERMS.advocate.many)}
        description="The customers who complete your requests. They join by invitation only — each gets a link that works once."
        action={<InviteAdvocate />}
      />

      {advocates.length === 0 ? (
        <EmptyState
          title={`No ${TERMS.advocate.many} yet`}
          description={`Invite a happy customer. Once they accept, you can send them ${TERMS.quest.many}.`}
        />
      ) : (
        <div className="bg-card rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{capitalize(TERMS.advocate.one)}</TableHead>
                <TableHead className="hidden sm:table-cell">Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {advocates.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.name ?? a.email}</div>
                    {a.name && (
                      <div className="text-muted-foreground text-xs">{a.email}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div>{a.company ?? "—"}</div>
                    {a.title && (
                      <div className="text-muted-foreground text-xs">{a.title}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-2">
                      <StatusBadge status={a.status} kind="advocate" />
                      {a.emailOptedOut && (
                        <span className="text-muted-foreground text-xs">
                          Unsubscribed from email
                        </span>
                      )}
                      {a.status === "INVITED" && !a.hasClaimed && (
                        <ReissueButton email={a.email} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyAmount amount={balanceOf.get(a.id) ?? 0} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
