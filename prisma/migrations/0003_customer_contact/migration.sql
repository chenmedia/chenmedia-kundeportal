-- Valgfri kontaktperson hos bedriften (intern, vises ikke på kundesiden)
ALTER TABLE "Customer" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Customer" ADD COLUMN "contactPhone" TEXT;
