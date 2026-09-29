import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export default function setup() {
  const dbFile = path.resolve("prisma/test.db");
  for (const f of [dbFile, dbFile + "-journal"]) if (fs.existsSync(f)) fs.rmSync(f);
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}
