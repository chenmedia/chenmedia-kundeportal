import crypto from "node:crypto";
import { sha256 } from "./crypto";

/**
 * Vercel Cron sender «Authorization: Bearer <CRON_SECRET>». Uten CRON_SECRET (minst 16 tegn) avvises alle kall,
 * så rutene er aldri åpne ved en glipp i oppsettet.
 */
export function cronAuthorized(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = headers.get("authorization") ?? "";
  const a = Buffer.from(sha256(got));
  const b = Buffer.from(sha256(`Bearer ${secret}`));
  return crypto.timingSafeEqual(a, b);
}
