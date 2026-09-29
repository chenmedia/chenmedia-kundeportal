import readline from "node:readline/promises";
import { createAdmin } from "../src/server/admin-core";
import { db } from "../src/server/db";

async function main() {
  let email = process.env.ADMIN_EMAIL ?? "";
  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!email) email = await rl.question("E-post: ");
    if (!password) password = await rl.question("Passord (min. 12 tegn, synlig mens du skriver): ");
    rl.close();
  }
  if (!email.includes("@")) throw new Error("Ugyldig e-post.");
  if (password.length < 12) throw new Error("Passordet må være minst 12 tegn.");
  await createAdmin(email, password);
  console.log(`Administrator opprettet/oppdatert: ${email}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
