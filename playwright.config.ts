import { defineConfig } from "@playwright/test";
import { E2E_DB_URL } from "./tests/db-reset";

const PORT = 3100;
export const E2E_ENV = {
  DATABASE_URL: E2E_DB_URL,
  DIRECT_URL: E2E_DB_URL,
  APP_SECRET: "e2e-secret-e2e-secret-e2e-secret-1",
  APP_URL: `http://localhost:${PORT}`,
  STORAGE_DIR: "./storage-e2e",
  ADMIN_EMAIL: "e2e@example.com",
  ADMIN_PASSWORD: "e2e-passord-12345",
  EMAIL_PROVIDER: "",
  SEED_DEMO_INQUIRIES: "0",
  NOTIFY_EMAIL: "team@example.com",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    // Produksjonsbygg i stedet for dev: ingen Fast Refresh-omlasting som tømmer skjemaer midt i testen.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: E2E_ENV,
  },
});
