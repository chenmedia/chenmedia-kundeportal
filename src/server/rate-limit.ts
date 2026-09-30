import { db } from "./db";
import { sha256 } from "./crypto";

/**
 * Enkel vedvarende vindusbegrenser lagret i databasen.
 * Returnerer true hvis forsøket er tillatt.
 */
export async function allow(rawKey: string, limit: number, windowSec: number): Promise<boolean> {
  const key = sha256(rawKey);
  const now = new Date();
  // Rydd bort gamle vinduer av og til, så tabellen ikke vokser uten grense.
  if (Math.random() < 0.02) await purgeStaleRateLimits(now).catch(() => undefined);
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row || now.getTime() - row.windowStart.getTime() > windowSec * 1000) {
    await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return true;
  }
  if (row.count >= limit) return false;
  await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}

export async function reset(rawKey: string) {
  await db.rateLimit.deleteMany({ where: { key: sha256(rawKey) } });
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/** Sletter rate-limit-rader som er eldre enn 24 timer (lengre enn alle brukte vinduer). */
export async function purgeStaleRateLimits(now: Date = new Date()): Promise<number> {
  const r = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600_000) } } });
  return r.count;
}
