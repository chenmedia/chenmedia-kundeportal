import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { imageSize } from "image-size";
import { db } from "./db";

export const MAX_UPLOAD = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function storageDir(): string {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

/** Validerer reelt filformat (magic bytes), ikke filendelse eller oppgitt MIME. */
export async function saveUpload(customerId: string, buf: Buffer, originalName: string): Promise<UploadResult> {
  if (buf.length === 0) return { ok: false, error: "Filen er tom." };
  if (buf.length > MAX_UPLOAD) return { ok: false, error: "Filen er større enn 10 MB." };
  let info;
  try {
    info = imageSize(buf);
  } catch {
    return { ok: false, error: "Filen er ikke et gyldig bilde. Bruk JPEG, PNG eller WebP." };
  }
  const mime = ALLOWED[info.type ?? ""];
  if (!mime || !info.width || !info.height) return { ok: false, error: "Bare JPEG, PNG og WebP er tillatt." };
  const key = `${crypto.randomBytes(16).toString("hex")}.${EXT[mime]}`;
  await fs.mkdir(storageDir(), { recursive: true });
  await fs.writeFile(path.join(storageDir(), key), buf, { flag: "wx" });
  const asset = await db.mediaAsset.create({
    data: {
      customerId, storageKey: key, originalName: originalName.slice(0, 200).replace(/[^\w.\- æøåÆØÅ]/g, "_"),
      mimeType: mime, width: info.width, height: info.height,
    },
  });
  return { ok: true, id: asset.id };
}

export async function readAsset(assetId: string) {
  const a = await db.mediaAsset.findUnique({ where: { id: assetId } });
  if (!a) return null;
  // storageKey genereres av oss, men verifiser likevel at den ikke kan forlate mappen.
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(a.storageKey)) return null;
  try {
    const data = await fs.readFile(path.join(storageDir(), a.storageKey));
    return { asset: a, data };
  } catch {
    return null;
  }
}
