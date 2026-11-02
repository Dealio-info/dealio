import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { capitalize, TERMS } from "@/lib/terms";

export const metadata = { title: "Advocates · Dealio" };

export default function AdvocatesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title={capitalize(TERMS.advocate.many)}
        description="The customers who complete your requests. They join by invitation only."
        action={<Button disabled>Invite an {TERMS.advocate.one}</Button>}
      />
      <EmptyState
        title="Not wired up yet"
        description={`The service layer behind this is done — inviting, claiming and listing all work and are tested. This page is what is missing.`}
      />
    </div>
  );
}
