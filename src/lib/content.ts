import { z } from "zod";

/** Priser lagres som heltall i øre. */
export const MAX_PACKAGES = 6;

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
  packages: z.array(packageSchema).max(MAX_PACKAGES).default([]),
  addons: z.array(addonSchema).max(30).default([]),
  practical: z.array(z.string().trim().max(300)).max(20).default([]),
});
export type Content = z.infer<typeof contentSchema>;

export const DEFAULT_INTRO =
  "Her finner du deres avtalte fotopakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.";
export const DEFAULT_CTA = "Send et fotobehov";

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
    if (pk.priceOre === null || pk.priceOre < 0) p.push(`${n}: pris mangler eller er negativ.`);
    if (pk.priceType === "from" && !pk.priceNote.trim() && !pk.description.trim())
      p.push(`${n}: fra-pris krever en forklarende tekst.`);
  });
  content.addons.forEach((a, i) => {
    const n = a.name.trim() || `Tillegg ${i + 1}`;
    if (!a.name.trim()) p.push(`Tillegg ${i + 1} mangler navn.`);
    if (a.basis === "percent") {
      if (a.percent === null) p.push(`${n}: prosentsats mangler.`);
    } else if (a.amountOre === null) p.push(`${n}: beløp mangler.`);
  });
  return p;
}
