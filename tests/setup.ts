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
