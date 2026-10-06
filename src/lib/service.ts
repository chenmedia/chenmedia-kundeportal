/**
 * Tjenester: eventfoto og eventfilm. Samme kundeside kan ha pakker av begge typer (hver pakke har en `kind`),
 * og kunden bytter mellom dem med faner. Innholdsmodellen (content.ts) er felles. Det som skiller tjenestene er
 * tekster, standardverdier og hint i editoren, og de ligger her.
 */
export const SERVICE_KINDS = ["photo", "film"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

/** Hva en forespørsel gjelder: én tjeneste, eller begge (kunden er usikker, eller ønsker foto og film). */
export const INQUIRY_KINDS = ["photo", "film", "both"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];

export interface ServiceConfig {
  /** Fanenavn og betegnelse i admin og e-post */
  label: string;
  /** Verdi i URL-en (?tjeneste=…) */
  slug: string;
  /** Overskrift over pakkene i denne tjenesten når siden har begge */
  packagesHeading: string;
  /** Hint og etiketter i editoren (feltene har samme struktur for begge typer) */
  editor: {
    coverageHint: string;
    deliverableLabel: string;
    deliverableHint: string;
    usageHint: string;
    deliveryHint: string;
  };
}

export const SERVICES: Record<ServiceKind, ServiceConfig> = {
  photo: {
    label: "Eventfoto",
    slug: "foto",
    packagesHeading: "Fotopakker",
    editor: {
      coverageHint: "F.eks. «Inntil 2 timer fotografering»",
      deliverableLabel: "Bildeantall",
      deliverableHint: "F.eks. «Inntil 20 høyoppløselige ferdig redigerte bilder»",
      usageHint: "F.eks. «Full ubegrenset digital bruksrett»",
      deliveryHint: "F.eks. «Levering innen 3 virkedager»",
    },
  },
  film: {
    label: "Eventfilm",
    slug: "film",
    packagesHeading: "Filmpakker",
    editor: {
      coverageHint: "F.eks. «Inntil 4 timer filming»",
      deliverableLabel: "Leveranse",
      deliverableHint: "F.eks. «Én ferdig redigert aftermovie på 1–2 minutter»",
      usageHint: "F.eks. «Full ubegrenset digital bruksrett»",
      deliveryHint: "F.eks. «Levering innen 10 virkedager»",
    },
  },
};

export function isServiceKind(v: unknown): v is ServiceKind {
  return typeof v === "string" && (SERVICE_KINDS as readonly string[]).includes(v);
}

/** Leser en tjeneste fra URL (?tjeneste=film) eller database. Ukjent verdi gir null. */
export function parseServiceKind(v: string | null | undefined): ServiceKind | null {
  if (!v) return null;
  if (isServiceKind(v)) return v;
  return SERVICE_KINDS.find((k) => SERVICES[k].slug === v) ?? null;
}

/** Betegnelse for en forespørsel eller pakke: «Eventfoto», «Eventfilm» eller «Foto og film». */
export function kindLabel(kind: string): string {
  if (kind === "both") return "Foto og film";
  return isServiceKind(kind) ? SERVICES[kind].label : kind;
}

/** Tjenestene en kunde tilbyr, i fast rekkefølge (foto, film). Uten pakker regnes siden som eventfoto. */
export function offeredKinds(content: { packages: { kind: ServiceKind }[] }): ServiceKind[] {
  const kinds = SERVICE_KINDS.filter((k) => content.packages.some((p) => p.kind === k));
  return kinds.length ? kinds : ["photo"];
}

/** Hvilke tekster siden bruker avhenger av om kunden har foto, film eller begge. */
type Profile = ServiceKind | "both";
const profileOf = (kinds: ServiceKind[]): Profile => (kinds.length > 1 ? "both" : kinds[0]);

interface Texts {
  eyebrow: string;
  title: (customerName: string) => string;
  intro: string;
  cta: string;
  /** Overskriften i skjemaet er den samme som knappeteksten */
  needNoun: string;
  heroPlaceholder: string;
  heroAlt: (customerName: string) => string;
}

const TEXTS: Record<Profile, Texts> = {
  photo: {
    eyebrow: "Eventfotografering",
    title: (n) => `Eventfotografering for ${n}`,
    intro: "Her finner du deres avtalte fotopakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.",
    cta: "Send et fotobehov",
    needNoun: "fotobehovet",
    heroPlaceholder: "Vi fanger øyeblikkene",
    heroAlt: (n) => `Bilde fra et event fotografert av Chen Media for ${n}`,
  },
  film: {
    eyebrow: "Eventfilm",
    title: (n) => `Eventfilm for ${n}`,
    intro: "Her finner du deres avtalte filmpakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.",
    cta: "Send et filmbehov",
    needNoun: "filmbehovet",
    heroPlaceholder: "Vi forteller historiene",
    heroAlt: (n) => `Bilde fra et event filmet av Chen Media for ${n}`,
  },
  both: {
    eyebrow: "Eventfoto og eventfilm",
    title: (n) => `Eventfoto og eventfilm for ${n}`,
    intro: "Her finner du deres avtalte foto- og filmpakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.",
    cta: "Send en forespørsel",
    needNoun: "behovet",
    heroPlaceholder: "Vi fanger og forteller",
    heroAlt: (n) => `Bilde fra et event fotografert og filmet av Chen Media for ${n}`,
  },
};

const DEFAULT_INTROS = Object.values(TEXTS).map((t) => t.intro);
const DEFAULT_CTAS = Object.values(TEXTS).map((t) => t.cta);

export const DEFAULT_GALLERY_TITLE = "Bilder fra oppdrag";

export interface PageTexts {
  profile: Profile;
  eyebrow: string;
  title: string;
  intro: string;
  cta: string;
  needNoun: string;
  heroPlaceholder: string;
  heroAlt: string;
  galleryTitle: string;
  /** «Bruk av bilder i trykk» gir bare mening når kunden har fotopakker */
  showPrintUse: boolean;
}

/** Standardtekstene for en kunde som tilbyr disse tjenestene. Brukes også som hint i editoren. */
export function defaultTexts(kinds: ServiceKind[], customerName: string): Omit<PageTexts, "galleryTitle"> {
  const profile = profileOf(kinds);
  const t = TEXTS[profile];
  return {
    profile, eyebrow: t.eyebrow, title: t.title(customerName), intro: t.intro, cta: t.cta, needNoun: t.needNoun,
    heroPlaceholder: t.heroPlaceholder, heroAlt: t.heroAlt(customerName), showPrintUse: kinds.includes("photo"),
  };
}

/**
 * Tekstene kundesiden viser. Det admin har skrevet gjelder alltid. Tomt felt, eller en av standardtekstene som ble lagret
 * da kunden ble opprettet (og som ikke passer lenger når kunden får filmpakker), gir standardtekst for kundens tjenester.
 */
export function pageTexts(
  kinds: ServiceKind[],
  customerName: string,
  stored: { introTitle: string; introText: string; ctaLabel: string; galleryTitle: string },
): PageTexts {
  const d = defaultTexts(kinds, customerName);
  const keep = (value: string, defaults: string[]) => (value && !defaults.includes(value) ? value : null);
  return {
    ...d,
    title: stored.introTitle || d.title,
    intro: keep(stored.introText, DEFAULT_INTROS) ?? d.intro,
    cta: keep(stored.ctaLabel, DEFAULT_CTAS) ?? d.cta,
    galleryTitle: stored.galleryTitle || DEFAULT_GALLERY_TITLE,
  };
}
