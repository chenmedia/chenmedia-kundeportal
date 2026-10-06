-- HubSpot-overføring: hvor langt hver forespørsel har kommet (kontakt, selskap, deal, oppgave) og kundens HubSpot-selskap.
-- Bare ID-er og status lagres her, aldri personopplysninger.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "hubspotCompanyId" TEXT;

CREATE TABLE IF NOT EXISTS "CrmSync" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "errorCategory" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmSync_inquiryId_key" ON "CrmSync"("inquiryId");
CREATE INDEX IF NOT EXISTS "CrmSync_status_idx" ON "CrmSync"("status");

DO $$ BEGIN
  ALTER TABLE "CrmSync" ADD CONSTRAINT "CrmSync_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Som alle andre tabeller: Row Level Security uten policies, så Supabase' åpne Data API ikke kan lese noe.
ALTER TABLE "CrmSync" ENABLE ROW LEVEL SECURITY;
