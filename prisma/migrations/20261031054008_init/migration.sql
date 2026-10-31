-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('BUSINESS_ADMIN', 'REP');

-- CreateEnum
CREATE TYPE "AdvocateStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('EMAIL_INTRO', 'REFERENCE_CALL', 'CASE_STUDY', 'TESTIMONIAL', 'PRODUCT_DEMO');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('PENDING_APPROVAL', 'REQUESTED', 'ACCEPTED', 'COMPLETED', 'VERIFIED', 'REWARDED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('OPPORTUNITY_REWARD', 'REDEMPTION', 'FULFILLMENT_FAILED', 'MANUAL_ADJUSTMENT', 'EXPIRY');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ORDERED', 'DELIVERED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_staff" (
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_staff_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "requireAdminApprovalForOpportunities" BOOLEAN NOT NULL DEFAULT true,
    "requireAdminApprovalForRewards" BOOLEAN NOT NULL DEFAULT true,
    "currencyNameOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advocates" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "title" TEXT,
    "status" "AdvocateStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "advocates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advocate_invites" (
    "id" UUID NOT NULL,
    "advocateId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advocate_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "advocateId" UUID NOT NULL,
    "type" "OpportunityType" NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rewardAmount" INTEGER NOT NULL,
    "prospectName" TEXT,
    "prospectCompany" TEXT,
    "prospectEmail" TEXT,
    "influencedRevenueCents" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_events" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "fromStatus" "OpportunityStatus",
    "toStatus" "OpportunityStatus" NOT NULL,
    "actorUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "advocateId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "opportunityId" UUID,
    "redemptionId" UUID,
    "actorUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cost" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tremendousProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "advocateId" UUID NOT NULL,
    "rewardId" UUID NOT NULL,
    "cost" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "externalOrderId" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" UUID,
    "orderedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabaseUserId_key" ON "users"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "memberships_businessId_role_idx" ON "memberships"("businessId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_businessId_key" ON "memberships"("userId", "businessId");

-- CreateIndex
CREATE INDEX "advocates_businessId_status_idx" ON "advocates"("businessId", "status");

-- CreateIndex
CREATE INDEX "advocates_userId_idx" ON "advocates"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "advocates_businessId_email_key" ON "advocates"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "advocate_invites_tokenHash_key" ON "advocate_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "advocate_invites_advocateId_idx" ON "advocate_invites"("advocateId");

-- CreateIndex
CREATE INDEX "opportunities_businessId_status_idx" ON "opportunities"("businessId", "status");

-- CreateIndex
CREATE INDEX "opportunities_advocateId_status_idx" ON "opportunities"("advocateId", "status");

-- CreateIndex
CREATE INDEX "opportunities_createdByUserId_idx" ON "opportunities"("createdByUserId");

-- CreateIndex
CREATE INDEX "opportunity_events_opportunityId_createdAt_idx" ON "opportunity_events"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_advocateId_createdAt_idx" ON "ledger_entries"("advocateId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_businessId_createdAt_idx" ON "ledger_entries"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_opportunityId_reason_key" ON "ledger_entries"("opportunityId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_redemptionId_reason_key" ON "ledger_entries"("redemptionId", "reason");

-- CreateIndex
CREATE INDEX "rewards_businessId_isActive_idx" ON "rewards"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_externalOrderId_key" ON "redemptions"("externalOrderId");

-- CreateIndex
CREATE INDEX "redemptions_businessId_status_idx" ON "redemptions"("businessId", "status");

-- CreateIndex
CREATE INDEX "redemptions_advocateId_requestedAt_idx" ON "redemptions"("advocateId", "requestedAt");

-- AddForeignKey
ALTER TABLE "platform_staff" ADD CONSTRAINT "platform_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocates" ADD CONSTRAINT "advocates_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocates" ADD CONSTRAINT "advocates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate_invites" ADD CONSTRAINT "advocate_invites_advocateId_fkey" FOREIGN KEY ("advocateId") REFERENCES "advocates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_advocateId_fkey" FOREIGN KEY ("advocateId") REFERENCES "advocates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_advocateId_fkey" FOREIGN KEY ("advocateId") REFERENCES "advocates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "redemptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_advocateId_fkey" FOREIGN KEY ("advocateId") REFERENCES "advocates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written guards, appended to the generated migration.
--
-- These enforce in the database what CLAUDE.md states as invariants. The
-- prototype relied on application discipline for exactly these rules and lost
-- real money to it, so they are constraints rather than conventions.
-- ===========================================================================

-- Invariant 1: `ledger_entries` is append-only.
--
-- A trigger rather than a revoked privilege, because the application connects
-- as the owner. This makes it impossible for any service, migration or manual
-- session to rewrite currency history — a balance is SUM(delta), so an edited
-- row would silently change an advocate's balance with no audit trail.
--
-- Corrections are made by appending a compensating entry (MANUAL_ADJUSTMENT,
-- or FULFILLMENT_FAILED when an external reward order fails), never by
-- changing or removing the original.
CREATE OR REPLACE FUNCTION ledger_entries_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- No USING ERRCODE: the default `raise_exception` (P0001) is passed through
  -- by Prisma with the message intact. An ERRCODE in the 23xxx
  -- integrity-constraint class gets translated into a generic "constraint
  -- violated" error and this message is lost.
  RAISE EXCEPTION
    'ledger_entries is append-only: % is not permitted. Append a compensating entry instead.',
    TG_OP;
END;
$$;

CREATE TRIGGER ledger_entries_no_mutate
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW
  EXECUTE FUNCTION ledger_entries_append_only();

-- A zero-delta entry carries no meaning and would only obscure the ledger.
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_delta_not_zero" CHECK ("delta" <> 0);

-- A manual adjustment without a stated reason is unauditable, which defeats
-- the point of having a ledger.
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_adjustment_requires_note"
  CHECK ("reason" <> 'MANUAL_ADJUSTMENT' OR ("note" IS NOT NULL AND length(btrim("note")) > 0));

-- Currency and money are non-negative at rest. Direction is carried by
-- `ledger_entries.delta`, not by a negative price or reward.
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_reward_amount_non_negative" CHECK ("rewardAmount" >= 0);

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_influenced_revenue_non_negative"
  CHECK ("influencedRevenueCents" IS NULL OR "influencedRevenueCents" >= 0);

ALTER TABLE "rewards"
  ADD CONSTRAINT "rewards_cost_non_negative" CHECK ("cost" >= 0);

ALTER TABLE "redemptions"
  ADD CONSTRAINT "redemptions_cost_non_negative" CHECK ("cost" >= 0);
