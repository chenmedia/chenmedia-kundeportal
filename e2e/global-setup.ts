import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { E2E_ENV } from "../playwright.config";

export default function setup() {
  for (const f of ["prisma/e2e.db", "prisma/e2e.db-journal"]) if (fs.existsSync(path.resolve(f))) fs.rmSync(path.resolve(f));
  const env = { ...process.env, ...E2E_ENV };
  execSync("npx prisma db push --skip-generate", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
