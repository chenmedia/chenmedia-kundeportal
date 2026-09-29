-- Innlogging kan skje via Supabase Auth; passordhash er da ikke i bruk.
ALTER TABLE "AdminUser" ALTER COLUMN "passwordHash" DROP NOT NULL;
