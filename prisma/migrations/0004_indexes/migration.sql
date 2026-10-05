-- Indekser på fremmednøkler og kolonner som brukes til filtrering, sortering og opprydding.
-- Postgres indekserer ikke fremmednøkler automatisk. IF NOT EXISTS gjør migrasjonen trygg å kjøre flere ganger.
CREATE INDEX IF NOT EXISTS "Inquiry_customerId_idx" ON "Inquiry"("customerId");
CREATE INDEX IF NOT EXISTS "Inquiry_versionId_idx" ON "Inquiry"("versionId");
CREATE INDEX IF NOT EXISTS "Inquiry_status_createdAt_idx" ON "Inquiry"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Inquiry_createdAt_idx" ON "Inquiry"("createdAt");
CREATE INDEX IF NOT EXISTS "EmailJob_inquiryId_idx" ON "EmailJob"("inquiryId");
CREATE INDEX IF NOT EXISTS "EmailJob_status_idx" ON "EmailJob"("status");
CREATE INDEX IF NOT EXISTS "MediaAsset_customerId_idx" ON "MediaAsset"("customerId");
CREATE INDEX IF NOT EXISTS "AdminSession_adminId_idx" ON "AdminSession"("adminId");
CREATE INDEX IF NOT EXISTS "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");
