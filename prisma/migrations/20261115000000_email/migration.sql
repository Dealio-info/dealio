-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('ADVOCATE_INVITE', 'QUEST_REQUESTED', 'QUEST_REWARDED', 'REDEMPTION_APPROVED', 'REDEMPTION_REJECTED', 'REDEMPTION_DELIVERED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "advocates" ADD COLUMN     "emailOptedOutAt" TIMESTAMP(3),
ADD COLUMN     "emailUnsubscribeToken" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateTable
CREATE TABLE "email_sends" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "advocateId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_sends_idempotencyKey_key" ON "email_sends"("idempotencyKey");

-- CreateIndex
CREATE INDEX "email_sends_businessId_createdAt_idx" ON "email_sends"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "email_sends_advocateId_idx" ON "email_sends"("advocateId");

-- CreateIndex
CREATE UNIQUE INDEX "advocates_emailUnsubscribeToken_key" ON "advocates"("emailUnsubscribeToken");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_advocateId_fkey" FOREIGN KEY ("advocateId") REFERENCES "advocates"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lock the new table out of Supabase's PostgREST, like every other table — see
-- 20261101005003_lock_out_postgrest. Prisma does not emit this; it is added by
-- hand, and postgrest-lockdown.integration.test.ts fails without it. The
-- grants are already covered by the default-privileges REVOKE in that
-- migration.
ALTER TABLE "email_sends" ENABLE ROW LEVEL SECURITY;
