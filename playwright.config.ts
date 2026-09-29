import { defineConfig } from "@playwright/test";

const PORT = 3100;
export const E2E_ENV = {
  DATABASE_URL: "file:./e2e.db?connection_limit=1",
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
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: E2E_ENV,
  },
});
