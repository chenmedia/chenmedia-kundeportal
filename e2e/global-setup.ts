import { execSync } from "node:child_process";
import { E2E_ENV } from "../playwright.config";
import { E2E_DB_URL, resetDatabase } from "../tests/db-reset";

export default async function setup() {
  await resetDatabase(E2E_DB_URL);
  execSync("npx tsx prisma/seed.ts", { env: { ...process.env, ...E2E_ENV }, stdio: "pipe" });
}
