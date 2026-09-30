import fs from "node:fs/promises";
import path from "node:path";
import { logWarn } from "./log";

/**
 * Lagringsadapter for bilder.
 * - Supabase Storage (privat bucket) når SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY er satt (drift/Vercel).
 * - Lokal disk ellers (utvikling og tester). Feiler tydelig på Vercel uten Supabase-oppsett.
 * Nøkler er alltid 32 hex-tegn og genereres av serveren.
 */
export const KEY_RE = /^[a-f0-9]{32}$/;

export interface Store {
  kind: "supabase" | "local";
  put(key: string, data: Buffer, mime: string): Promise<void>;
  /** Mål der nettleseren laster opp selve filen. */
  uploadTarget(key: string): Promise<{ url: string }>;
  /** Leser de første byte og total størrelse. */
  readRange(key: string, maxBytes: number): Promise<{ bytes: Buffer; total: number } | null>;
  remove(key: string): Promise<void>;
  /** Svarer på en allerede tilgangskontrollert forespørsel. */
  serve(key: string, mime: string): Promise<Response | null>;
}

function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error("Ugyldig lagringsnøkkel");
}

function storageDir(): string {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

const local: Store = {
  kind: "local",
  async put(key, data) {
    assertKey(key);
    await fs.mkdir(storageDir(), { recursive: true });
    await fs.writeFile(path.join(storageDir(), key), data, { flag: "w" });
  },
  async uploadTarget(key) {
    assertKey(key);
    return { url: `/api/admin/media/local/${key}` };
  },
  async readRange(key, maxBytes) {
    assertKey(key);
    try {
      const fh = await fs.open(path.join(storageDir(), key), "r");
      try {
        const { size } = await fh.stat();
        const buf = Buffer.alloc(Math.min(size, maxBytes));
        await fh.read(buf, 0, buf.length, 0);
        return { bytes: buf, total: size };
      } finally {
        await fh.close();
      }
    } catch {
      return null;
    }
  },
  async remove(key) {
    assertKey(key);
    await fs.rm(path.join(storageDir(), key), { force: true });
  },
  async serve(key, mime) {
    assertKey(key);
    try {
      const data = await fs.readFile(path.join(storageDir(), key));
      const { imageResponse } = await import("./image-response");
      return imageResponse(data, mime);
    } catch {
      return null;
    }
  },
};

function supabase(): Store {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "") + "/storage/v1";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "kundeportal-media";
  const auth = { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY! };
  return {
    kind: "supabase",
    async put(key, data, mime) {
      assertKey(key);
      const res = await fetch(`${base}/object/${bucket}/${key}`, {
        method: "POST", headers: { ...auth, "Content-Type": mime, "x-upsert": "true" }, body: new Uint8Array(data),
      });
      if (!res.ok) { logWarn("storage.put", "opplasting feilet", { status: res.status }); throw new Error(`storage_put_${res.status}`); }
    },
    async uploadTarget(key) {
      assertKey(key);
      const res = await fetch(`${base}/object/upload/sign/${bucket}/${key}`, { method: "POST", headers: auth });
      if (!res.ok) { logWarn("storage.sign-upload", "signering feilet", { status: res.status }); throw new Error(`storage_sign_${res.status}`); }
      const { url } = (await res.json()) as { url: string };
      return { url: base + url };
    },
    async readRange(key, maxBytes) {
      assertKey(key);
      const res = await fetch(`${base}/object/authenticated/${bucket}/${key}`, { headers: { ...auth, Range: `bytes=0-${maxBytes - 1}` } });
      if (!res.ok) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      const cr = res.headers.get("content-range"); // bytes 0-65535/12345
      const total = cr ? Number(cr.split("/")[1]) : bytes.length;
      return { bytes, total: Number.isFinite(total) ? total : bytes.length };
    },
    async remove(key) {
      assertKey(key);
      await fetch(`${base}/object/${bucket}/${key}`, { method: "DELETE", headers: auth }).catch(() => undefined);
    },
    async serve(key) {
      assertKey(key);
      // Tilgang er sjekket av kalleren. Send kunden videre til en signert URL som varer 60 sekunder
      // (unngår Vercels grense på ca. 4,5 MB for funksjonsrespons).
      const res = await fetch(`${base}/object/sign/${bucket}/${key}`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }),
      });
      if (!res.ok) { logWarn("storage.sign-download", "signering feilet", { status: res.status }); return null; }
      const { signedURL } = (await res.json()) as { signedURL: string };
      return new Response(null, {
        status: 302,
        headers: { Location: base + signedURL, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
      });
    },
  };
}

export function getStore(): Store {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return supabase();
  if (process.env.VERCEL) {
    throw new Error("Bildelagring er ikke konfigurert: sett SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY.");
  }
  return local;
}
