import { requireIdentity } from "@/server/auth";
import { prisma } from "@/server/db";
import { advocateActor } from "@/server/context";
import { getAdvocateDashboard } from "@/server/services/advocates/advocate-dashboard";
import { EmptyState } from "@/components/app/empty-state";
import { BusinessSection } from "./business-section";

export const metadata = { title: "Dashboard · Dealio" };

/**
 * The advocate's home: what has been asked of them, what they have, and what
 * it buys — in one place, per business.
 *
 * Everything comes from `getAdvocateDashboard`, which composes services that
 * already scope an advocate to their own rows. This file only arranges.
 */
export default async function AdvocateHome() {
  const identity = await requireIdentity();

  if (identity.advocates.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        description={`You are signed in as ${identity.user.email}, but you have not accepted an invite. Access comes from an invitation — ask your contact to send one.`}
      />
    );
  }

  // One dashboard per business, never merged: a balance earned at one company
  // cannot be spent at another, so a combined total would mislead.
  const sections = await Promise.all(
    identity.advocates.map(async (profile) => {
      const actor = advocateActor(identity, profile.businessId);
      return { actor, dashboard: await getAdvocateDashboard({ db: prisma, actor }) };
    }),
  );

  return (
    <div className="space-y-16">
      {sections.map(({ actor, dashboard }) => (
        <BusinessSection
          key={dashboard.businessId}
          actor={actor}
          dashboard={dashboard}
        />
      ))}
    </div>
  );
}
