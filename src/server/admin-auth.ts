import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { db } from "./db";
import { sha256, verifyPassword } from "./crypto";
import { supabaseAuthConfigured, verifyWithSupabase } from "./supabase-auth";
export { createAdmin } from "./admin-core";
import { allow, clientIp, reset } from "./rate-limit";

export const SESSION_COOKIE = "cm_admin";
const SESSION_HOURS = 12;

/** Returnerer sesjonstoken ved suksess, ellers en feilkode. */
export async function login(email: string, password: string, ip: string) {
  const key = `login:${ip}:${email.toLowerCase()}`;
  if (!(await allow(key, 8, 15 * 60))) return { ok: false as const, error: "rate" as const };
  const user = await db.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  let ok: boolean;
  if (supabaseAuthConfigured()) {
    // Legitimasjon sjekkes hos Supabase Auth. Tilgang krever i tillegg at e-posten står i AdminUser.
    ok = (await verifyWithSupabase(email.toLowerCase(), password)).ok && !!user;
  } else {
    // Lokal utvikling/test: passordhash i AdminUser. Alltid kjør hash-sammenligning (jevn responstid).
    ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, "scrypt$AAAA$AAAA"), false);
  }
  if (!user || !ok) return { ok: false as const, error: "invalid" as const };
  await reset(key);
  const token = crypto.randomBytes(32).toString("base64url");
  await db.adminSession.create({
    data: { tokenHash: sha256(token), adminId: user.id, expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
  });
  return { ok: true as const, token, maxAge: SESSION_HOURS * 3600 };
}

export async function sessionFromToken(token: string | undefined) {
  if (!token) return null;
  const s = await db.adminSession.findUnique({ where: { tokenHash: sha256(token) }, include: { admin: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.admin;
}

export async function currentAdmin() {
  const jar = await cookies();
  return sessionFromToken(jar.get(SESSION_COOKIE)?.value);
}

/** Skal kalles i hver admin-side, server-action og admin-API. */
export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login?utlopt=1");
  return admin;
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await db.adminSession.deleteMany({ where: { tokenHash: sha256(t) } });
  jar.delete(SESSION_COOKIE);
}

/** Origin-sjekk for mutasjoner som ikke går via server actions. */
export function sameOrigin(h: Headers): boolean {
  const origin = h.get("origin");
  if (!origin) return false;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function requestIp() {
  return clientIp(await headers());
}
