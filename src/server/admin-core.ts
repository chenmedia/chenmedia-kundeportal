import { db } from "./db";
import { hashPassword } from "./crypto";

export async function createAdmin(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  return db.adminUser.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), passwordHash },
    update: { passwordHash },
  });
}
