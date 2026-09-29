// Hjelper for e2e-tester: skriver ut /k/<token> for en kunde (finnes ikke i produksjonsbruk).
import { db } from "../src/server/db";
import { getRawToken } from "../src/server/customers";

async function main() {
  const name = process.argv[2] ?? "OBOS";
  const c = await db.customer.findFirstOrThrow({ where: { name } });
  process.stdout.write(`/k/${await getRawToken(c.id)}`);
}
main().finally(() => db.$disconnect());
