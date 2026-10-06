import { z } from "zod";

/** Priser lagres som heltall i øre. */
export const MAX_PACKAGES = 6;
export const MAX_GALLERY = 6;

const optionalText = (max: number) => z.string().trim().max(max).default("");

const packageSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(80).default(""),
  priceType: z.enum(["fixed", "from"]).default("fixed"),
  priceOre: z.number().int().min(0).nullable().default(null),
  /** Forklaring, påkrevd for fra-pris */
  priceNote: optionalText(300),
  description: optionalText(500),
  coverage: optionalText(120), // «Inntil 2 timer fotografering»
  images: optionalText(120),
  usage: optionalText(120),
  delivery: optionalText(120),
  custom: z.boolean().default(false),
  /** Valgfritt illustrasjonsbilde øverst på pakkekortet */
  imageId: z.string().nullable().default(null),
  imageAlt: optionalText(200),
});
export type PackageContent = z.infer<typeof packageSchema>;

export const addonBasis = ["per_hour", "one_time", "from", "from_per_image", "percent"] as const;
export type AddonBasis = (typeof addonBasis)[number];
export const addonBasisLabels: Record<AddonBasis, string> = {
  per_hour: "Per time",
  one_time: "Engangsbeløp",
  from: "Fra-pris",
  from_per_image: "Fra-pris per bilde",
  percent: "Prosenttillegg",
};

const addonSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(120).default(""),
  basis: z.enum(addonBasis).default("one_time"),
  amountOre: z.number().int().min(0).nullable().default(null),
  percent: z.number().min(0).max(1000).nullable().default(null),
  note: optionalText(300),
});
export type AddonContent = z.infer<typeof addonSchema>;

const galleryItemSchema = z.object({
  id: z.string().min(1),
  imageId: z.string().min(1),
  /** Tom = dekorativt bilde (skjules for skjermlesere) */
  alt: optionalText(200),
  /** Vises under bildet, f.eks. «Summer Party 2026 · 4 timer». */
  caption: optionalText(120),
});
export type GalleryItem = z.infer<typeof galleryItemSchema>;

export const contentSchema = z.object({
  introTitle: optionalText(150), // tomt = «Eventfotografering for [kunde]»
  introText: z.string().trim().max(800).default(""),
  ctaLabel: optionalText(60),
  heroImageId: z.string().nullable().default(null),
  heroImageAlt: optionalText(200),
  agreementLabel: optionalText(60),
  validityText: optionalText(200),
  contactName: optionalText(100),
  contactEmail: optionalText(200),
  galleryTitle: optionalText(80), // tomt = «Bilder fra oppdrag»
  gallery: z.array(galleryItemSchema).max(MAX_GALLERY).default([]),
  packages: z.array(packageSchema).max(MAX_PACKAGES).default([]),
  addons: z.array(addonSchema).max(30).default([]),
  practical: z.array(z.string().trim().max(300)).max(20).default([]),
});
export type Content = z.infer<typeof contentSchema>;

export const DEFAULT_INTRO =
  "Her finner du deres avtalte fotopakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.";
export const DEFAULT_CTA = "Send et fotobehov";
export const DEFAULT_GALLERY_TITLE = "Bilder fra oppdrag";

/** Alle bilder innholdet bruker (hero, pakker, galleri), uten duplikater. Styrer hva kundelenken får servere. */
export function contentImageIds(content: Content): string[] {
  const ids = [content.heroImageId, ...content.packages.map((p) => p.imageId), ...content.gallery.map((g) => g.imageId)];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

/** Bytter bildereferanser (brukes når en kunde dupliseres og bildene får nye ID-er). Ukjente referanser fjernes. */
export function remapImageIds(content: Content, map: (id: string) => string | undefined): Content {
  const m = (id: string | null) => (id ? map(id) ?? null : null);
  return {
    ...content,
    heroImageId: m(content.heroImageId),
    packages: content.packages.map((p) => ({ ...p, imageId: m(p.imageId) })),
    gallery: content.gallery.flatMap((g) => { const id = m(g.imageId); return id ? [{ ...g, imageId: id }] : []; }),
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyContent(): Content {
  return contentSchema.parse({ introText: DEFAULT_INTRO, ctaLabel: DEFAULT_CTA });
}

export function parseContent(json: string): Content {
  return contentSchema.parse(JSON.parse(json));
}

/** Mapper på tvers av draft/published slik at like innhold gir lik streng. */
export function canonical(content: Content): string {
  return JSON.stringify(contentSchema.parse(content));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v) && v.length <= 254;
}

/** Krav for publisering. Returnerer feilmeldinger (tom liste = OK). */
export function publishProblems(content: Content, customerName: string, needsRename: boolean): string[] {
  const p: string[] = [];
  if (!customerName.trim()) p.push("Kundenavn mangler.");
  if (needsRename) p.push("Gi den dupliserte kunden et nytt navn før første publisering.");
  if (!content.contactEmail || !isEmail(content.contactEmail)) p.push("Kontaktadressen mangler eller er ugyldig.");
  if (!content.agreementLabel.trim()) p.push("Avtaleetikett mangler (f.eks. «Prisliste V2026»).");
  if (content.packages.length === 0) p.push("Legg til minst én pakke.");
  content.packages.forEach((pk, i) => {
    const n = pk.name.trim() || `Pakke ${i + 1}`;
    if (!pk.name.trim()) p.push(`Pakke ${i + 1} mangler navn.`);
    if (pk.priceOre === null) p.push(`${n}: pris mangler.`);
    else if (pk.priceOre <= 0) p.push(`${n}: prisen må være større enn 0 kr.`);
    if (pk.priceType === "from" && !pk.priceNote.trim() && !pk.description.trim())
      p.push(`${n}: fra-pris krever en forklarende tekst.`);
  });
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const pk of content.packages) {
    const nm = pk.name.trim();
    const key = nm.toLowerCase();
    if (!nm) continue;
    if (seen.has(key) && !reported.has(key)) { p.push(`To pakker heter «${nm}». Gi dem ulike navn.`); reported.add(key); }
    seen.add(key);
  }
  content.addons.forEach((a, i) => {
    const n = a.name.trim() || `Tillegg ${i + 1}`;
    if (!a.name.trim()) p.push(`Tillegg ${i + 1} mangler navn.`);
    if (a.basis === "percent") {
      if (a.percent === null) p.push(`${n}: prosentsats mangler.`);
    } else if (a.amountOre === null) p.push(`${n}: beløp mangler.`);
  });
  return p;
}

/** Pakkepriser under dette (øre) gir en advarsel ved publisering, typisk en tastefeil. */
export const LOW_PRICE_WARNING_ORE = 10_000;

/** Ting som ikke stopper publisering, men som admin bør bekrefte. Tom liste = ingenting å melde. */
export function publishWarnings(content: Content): string[] {
  const w: string[] = [];
  content.packages.forEach((pk, i) => {
    const n = pk.name.trim() || `Pakke ${i + 1}`;
    if (pk.priceOre !== null && pk.priceOre > 0 && pk.priceOre < LOW_PRICE_WARNING_ORE) {
      w.push(`${n}: prisen er bare ${String(pk.priceOre / 100).replace(".", ",")} kr. Stemmer det?`);
    }
  });
  content.addons.forEach((a, i) => {
    const n = a.name.trim() || `Tillegg ${i + 1}`;
    if (a.basis === "percent" && a.percent !== null && a.percent > 100) w.push(`${n}: prosenttillegget er over 100 %.`);
    if (a.basis !== "percent" && a.amountOre === 0) w.push(`${n}: beløpet er 0 kr.`);
  });
  return w;
}
