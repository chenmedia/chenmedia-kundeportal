import { z } from "zod";

/** Priser lagres som heltall i øre. */
export const MAX_PACKAGES = 6;

const optionalText = (max: number) => z.string().trim().max(max).default("");

export const packageSchema = z.object({
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

export const addonSchema = z.object({
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

// ---------- Formatering ----------

const nok = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
export function formatKr(ore: number): string {
  // Bruk vanlig mellomrom-variant med hardt mellomrom slik at «16 000 kr» ikke brytes.
  return `${nok.format(Math.round(ore / 100)).replace(/\s/g, " ")} kr`;
}

export function formatPackagePrice(p: PackageContent): { label: string; amount: string } {
  const amount = p.priceOre === null ? "–" : formatKr(p.priceOre);
  return { label: p.priceType === "from" ? "Fra" : "Fastpris", amount };
}

export function formatAddonPrice(a: AddonContent): string {
  if (a.basis === "percent") return `+ ${a.percent ?? 0} %`;
  const amt = a.amountOre === null ? "–" : formatKr(a.amountOre);
  switch (a.basis) {
    case "per_hour": return `${amt}/time`;
    case "from": return `fra ${amt}`;
    case "from_per_image": return `fra ${amt}/bilde`;
    default: return amt;
  }
}

/** Dato i Europe/Oslo som YYYY-MM-DD. */
export function todayInOslo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "medium", timeStyle: "short" }).format(d);
}
export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "long" }).format(d);
}
export function formatCalendarDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("nb-NO", { timeZone: "UTC", dateStyle: "long" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// ---------- Forespørsel ----------

export const inquiryInputSchema = z
  .object({
    packageId: z.string().min(1, "Velg en pakke, eller «Usikker / annet behov»."),
    eventName: z.string().trim().min(2, "Skriv minst 2 tegn.").max(150, "Maks 150 tegn."),
    dateUnknown: z.boolean().default(false),
    eventDate: z.string().trim().default(""),
    locationUnknown: z.boolean().default(false),
    location: z.string().trim().max(200, "Maks 200 tegn.").default(""),
    timeframe: z.string().trim().max(150, "Maks 150 tegn.").default(""),
    description: z.string().trim().min(10, "Skriv minst 10 tegn.").max(3000, "Maks 3000 tegn."),
    contactName: z.string().trim().min(2, "Skriv minst 2 tegn.").max(100, "Maks 100 tegn."),
    contactEmail: z.string().trim().refine(isEmail, "Skriv en gyldig e-postadresse, for eksempel navn@firma.no."),
    contactPhone: z.string().trim().max(40, "Maks 40 tegn.").default(""),
    express: z.boolean().default(false),
    printUse: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!v.dateUnknown) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.eventDate)) {
        ctx.addIssue({ code: "custom", path: ["eventDate"], message: "Velg en dato, eller kryss av for «Dato er ikke avklart»." });
      } else if (v.eventDate < todayInOslo()) {
        ctx.addIssue({ code: "custom", path: ["eventDate"], message: "Datoen har passert. Velg en dato fra i dag av." });
      }
    }
    if (!v.locationUnknown && v.location.length < 2) {
      ctx.addIssue({ code: "custom", path: ["location"], message: "Skriv sted, eller kryss av for «Sted er ikke avklart»." });
    }
  });
export type InquiryInput = z.infer<typeof inquiryInputSchema>;

export const OTHER_PACKAGE = "other";

export const STATUS_LABELS: Record<string, string> = {
  new: "Ny",
  following_up: "Under oppfølging",
  clarified: "Avklart",
  closed: "Avsluttet",
};
export const STATUSES = Object.keys(STATUS_LABELS);

export interface InquirySnapshot {
  customerName: string;
  agreementLabel: string;
  versionNumber: number;
  package: PackageContent | null;
  addons: AddonContent[];
  practical: string[];
}
