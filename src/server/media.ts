import crypto from "node:crypto";
import sharp from "sharp";
import { logError } from "./log";
import { db } from "./db";
import { KEY_RE, getStore } from "./storage";

export const MAX_UPLOAD = 10 * 1024 * 1024;
/** Lengste side på lagret bilde. Et heltoppbilde trenger aldri mer enn dette. */
export const MAX_DIMENSION = 1600;
/**
 * Formater vi leser (kontrollert mot filens faktiske innhold, ikke filendelsen). Alt konverteres til WebP,
 * så AVIF, HEIF, GIF og TIFF kan godtas selv om nettleseren bare tilbyr JPEG/PNG/WebP i velgeren.
 * Mange «.jpg»-filer er i virkeligheten AVIF eller WebP lastet ned fra nettsider.
 */
const READABLE = new Set(["jpeg", "png", "webp", "avif", "heif", "gif", "tiff"]);
const UNSUPPORTED = "Filen er ikke et gyldig bilde, eller formatet støttes ikke. Bruk JPEG, PNG eller WebP.";

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

function newStorageKey(): string {
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
  const head = await store.readRange(key, 1);
  if (!head || head.total === 0) return fail("Filen er tom eller ble ikke lastet opp.");
  if (head.total > MAX_UPLOAD) return fail("Filen er større enn 10 MB.");
  // Hele filen leses (maks 10 MB): sharp finner formatet fra innholdet, også når JPEG har mer enn 128 KB
  // metadata før selve bildet.
  const original = await store.read(key);
  if (!original) return fail("Filen ble ikke funnet etter opplasting.");
  let info;
  try {
    info = await sharp(original, { limitInputPixels: 100_000_000 }).metadata();
  } catch {
    return fail(UNSUPPORTED);
  }
  if (!info.format || !READABLE.has(info.format) || !info.width || !info.height) return fail(UNSUPPORTED);
  if (await db.mediaAsset.findFirst({ where: { storageKey: key, customerId: { not: customerId } } })) {
    return { ok: false, error: "Ugyldig opplasting." };
  }
  // Skaler ned og konverter til WebP. Fjerner også metadata (EXIF, inkl. GPS-posisjon) og retter opp rotasjon.
  let processed: { data: Buffer; width: number; height: number };
  try {
    const { data, info: out } = await sharp(original, { failOn: "error", limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    processed = { data, width: out.width, height: out.height };
  } catch (e) {
    logError("media.process", e, { format: info.format });
    return fail(
      info.format === "heif"
        ? "Kunne ikke lese bildet (HEIC fra iPhone støttes ikke). Eksporter det som JPEG eller PNG og prøv igjen."
        : "Kunne ikke behandle bildet. Prøv en annen fil (JPEG, PNG eller WebP).",
    );
  }
  const finalKey = newStorageKey();
  try {
    await store.put(finalKey, processed.data, "image/webp");
  } catch (e) {
    logError("media.store", e);
    return fail("Kunne ikke lagre bildet. Prøv igjen.");
  }
  await store.remove(key); // originalen beholdes ikke
  const asset = await db.mediaAsset.create({
    data: {
      customerId, storageKey: finalKey, originalName: originalName.slice(0, 200).replace(/[^\w.\- æøåÆØÅ]/g, "_"),
      mimeType: "image/webp", width: processed.width, height: processed.height,
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
