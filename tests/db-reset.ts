import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Nullstiller og migrerer en TEST-database. Nekter å røre databaser som ikke slutter på _test/_e2e. */
export async function resetDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/_(test|e2e)$/.test(name)) throw new Error(`Avviser å nullstille «${name}»: bare *_test og *_e2e er tillatt.`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await prisma.$disconnect();
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "pipe" });
}

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/kundepriser_test";
export const E2E_DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:5433/kundepriser_e2e";
