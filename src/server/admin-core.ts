import { db } from "./db";
import { hashPassword } from "./crypto";

/**
 * Legger en administrator på godkjenningslisten.
 * Med Supabase Auth trengs ikke passord her (det ligger hos Supabase). Uten Supabase (lokalt) gis passord.
 */
export async function createAdmin(email: string, password?: string) {
  const passwordHash = password ? await hashPassword(password) : null;
  return db.adminUser.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), passwordHash },
    update: passwordHash ? { passwordHash } : {},
  });
}
