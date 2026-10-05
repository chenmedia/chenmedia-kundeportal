import { beforeEach } from "vitest";
import { TEST_DB_URL } from "./db-reset";

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DIRECT_URL = TEST_DB_URL;
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.APP_URL = "http://localhost:3000";
process.env.EMAIL_PROVIDER = "";
process.env.STORAGE_DIR = "./storage-test";
process.env.NOTIFY_EMAIL = "team@example.com";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const k of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) delete process.env[k];

// Begrensningene (innlogging, innsending, kvitteringer per adresse) skal ikke lekke mellom tester som deler database.
beforeEach(async () => {
  const { db } = await import("@/server/db");
  await db.rateLimit.deleteMany({});
});
