import crypto from "node:crypto";
import { imageSize } from "image-size";
import { db } from "./db";
import { KEY_RE, getStore } from "./storage";

export { storageDir } from "./storage";
export const MAX_UPLOAD = 10 * 1024 * 1024;
const HEADER_BYTES = 128 * 1024;
const ALLOWED: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

export function newStorageKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Steg 1: gi nettleseren et mål å laste opp til. */
export async function prepareUpload() {
  const key = newStorageKey();
  const target = await getStore().uploadTarget(key);
  return { key, uploadUrl: target.url, kind: getStore().kind };
}

/**
 * Steg 3: valider den opplastede filen (reelt format via magic bytes, størrelse) og registrer den.
 * Ugyldige filer fjernes fra lagringen.
 */
export async function completeUpload(customerId: string, key: string, originalName: string): Promise<UploadResult> {
  if (!KEY_RE.test(key)) return { ok: false, error: "Ugyldig opplasting." };
  const store = getStore();
  const fail = async (error: string): Promise<UploadResult> => {
    await store.remove(key);
    return { ok: false, error };
  };
  const head = await store.readRange(key, HEADER_BYTES);
  if (!head || head.total === 0) return fail("Filen er tom eller ble ikke lastet opp.");
  if (head.total > MAX_UPLOAD) return fail("Filen er større enn 10 MB.");
  let info;
  try {
    info = imageSize(head.bytes);
  } catch {
    return fail("Filen er ikke et gyldig bilde. Bruk JPEG, PNG eller WebP.");
  }
  const mime = ALLOWED[info.type ?? ""];
  if (!mime || !info.width || !info.height) return fail("Bare JPEG, PNG og WebP er tillatt.");
  if (await db.mediaAsset.findFirst({ where: { storageKey: key, customerId: { not: customerId } } })) {
    return { ok: false, error: "Ugyldig opplasting." };
  }
  const asset = await db.mediaAsset.create({
    data: {
      customerId, storageKey: key, originalName: originalName.slice(0, 200).replace(/[^\w.\- æøåÆØÅ]/g, "_"),
      mimeType: mime, width: info.width, height: info.height,
    },
  });
  return { ok: true, id: asset.id };
}

/** Samlet opplasting fra serversiden (tester, seed, små filer). */
export async function saveUpload(customerId: string, buf: Buffer, originalName: string): Promise<UploadResult> {
  if (buf.length === 0) return { ok: false, error: "Filen er tom." };
  if (buf.length > MAX_UPLOAD) return { ok: false, error: "Filen er større enn 10 MB." };
  const key = newStorageKey();
  await getStore().put(key, buf, "application/octet-stream");
  return completeUpload(customerId, key, originalName);
}

export async function serveAsset(assetId: string): Promise<{ customerId: string; response: Response } | null> {
  const a = await db.mediaAsset.findUnique({ where: { id: assetId } });
  if (!a || !KEY_RE.test(a.storageKey)) return null;
  const response = await getStore().serve(a.storageKey, a.mimeType);
  return response ? { customerId: a.customerId, response } : null;
}

export async function assetOwner(assetId: string): Promise<string | null> {
  return (await db.mediaAsset.findUnique({ where: { id: assetId }, select: { customerId: true } }))?.customerId ?? null;
}
