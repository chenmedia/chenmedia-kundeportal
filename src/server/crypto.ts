import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

/** Minst 32 kryptografisk tilfeldige byte. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Eksempelverdier fra .env.example som aldri skal brukes i drift (alle med tilgang til repoet kjenner dem). */
const PLACEHOLDER_SECRETS = new Set(["bytt-meg-lokal-utvikling-bytt-meg-lokal"]);

function secretKey(): Buffer {
  const s = process.env.APP_SECRET;
  if (s && PLACEHOLDER_SECRETS.has(s) && process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET er eksempelverdien fra .env.example. Generer en egen hemmelighet.");
  }
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET må settes (minst 16 tegn) i produksjon.");
    return crypto.createHash("sha256").update("dev-only-secret").digest();
  }
  return crypto.createHash("sha256").update(s).digest();
}

export function encryptText(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptText(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, s, k] = stored.split("$");
  if (alg !== "scrypt" || !s || !k) return false;
  const expected = Buffer.from(k, "base64url");
  const key = await scrypt(password, Buffer.from(s, "base64url"), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

export function randomReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return "CM-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
