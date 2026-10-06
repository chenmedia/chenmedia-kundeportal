-- Portaler: en kunde kan ha både eventfoto og eventfilm bak samme lenke.
-- Utkast, versjoner og aktiv versjon flyttes fra kunden til en portal. Alle eksisterende kunder får én portal av typen «photo»
-- med samme innhold, versjonsnumre og aktive versjon, så ingenting endres for kundene.

-- CreateTable
CREATE TABLE "Portal" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalDraft" (
    "portalId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalDraft_pkey" PRIMARY KEY ("portalId")
);

-- Datamigrering: én foto-portal per eksisterende kunde (portal-ID = kunde-ID + «_photo»)
INSERT INTO "Portal" ("id", "customerId", "kind", "currentVersionId", "createdAt")
SELECT "id" || '_photo', "id", 'photo', "currentVersionId", "createdAt" FROM "Customer";

INSERT INTO "PortalDraft" ("portalId", "content", "updatedAt")
SELECT "customerId" || '_photo', "content", "updatedAt" FROM "CustomerDraft";

ALTER TABLE "PublishedVersion" ADD COLUMN "portalId" TEXT;
UPDATE "PublishedVersion" SET "portalId" = "customerId" || '_photo';
ALTER TABLE "PublishedVersion" ALTER COLUMN "portalId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_currentVersionId_fkey";
ALTER TABLE "CustomerDraft" DROP CONSTRAINT "CustomerDraft_customerId_fkey";
ALTER TABLE "PublishedVersion" DROP CONSTRAINT "PublishedVersion_customerId_fkey";

-- DropIndex
DROP INDEX "Customer_currentVersionId_key";
DROP INDEX "PublishedVersion_customerId_number_key";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "currentVersionId";
ALTER TABLE "PublishedVersion" DROP COLUMN "customerId";
ALTER TABLE "Inquiry" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'photo';

-- DropTable
DROP TABLE "CustomerDraft";

-- CreateIndex
CREATE UNIQUE INDEX "Portal_currentVersionId_key" ON "Portal"("currentVersionId");
CREATE UNIQUE INDEX "Portal_customerId_kind_key" ON "Portal"("customerId", "kind");
CREATE UNIQUE INDEX "PublishedVersion_portalId_number_key" ON "PublishedVersion"("portalId", "number");

-- AddForeignKey
ALTER TABLE "Portal" ADD CONSTRAINT "Portal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Portal" ADD CONSTRAINT "Portal_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PublishedVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortalDraft" ADD CONSTRAINT "PortalDraft_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "Portal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishedVersion" ADD CONSTRAINT "PublishedVersion_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "Portal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indekser (se 0004)
CREATE INDEX "PublishedVersion_portalId_idx" ON "PublishedVersion"("portalId");

-- Row Level Security uten policies, som på de andre tabellene (se 0001): Supabase' åpne Data API får ikke lese noe.
ALTER TABLE "Portal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalDraft" ENABLE ROW LEVEL SECURITY;
