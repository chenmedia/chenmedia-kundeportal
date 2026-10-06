/**
 * Portaltyper. Samme kunde kan ha både eventfoto og eventfilm bak én lenke, som faner på kundesiden.
 * Innholdsmodellen (content.ts) er felles. Det som skiller portalene er tekster, standardverdier og hint i editoren.
 */
export const PORTAL_KINDS = ["photo", "film"] as const;
export type PortalKind = (typeof PORTAL_KINDS)[number];

export interface PortalConfig {
  /** Fanenavn og betegnelse i admin og e-post */
  label: string;
  /** Verdi i URL-en (?tjeneste=…) */
  slug: string;
  /** Etikett over tittelen: «Eventfotografering · OBOS» */
  eyebrow: string;
  /** Standardtittel når admin lar tittelfeltet stå tomt */
  title: (customerName: string) => string;
  intro: string;
  cta: string;
  /** Overskrift i forespørselsskjemaet */
  formHeading: string;
  galleryTitle: string;
  /** Tekst i personvernerklæringen: «følge opp … behovet ditt» */
  needNoun: string;
  /** Tekst i plassholderbildet når portalen ikke har eventbilde */
  heroPlaceholder: string;
  /** «Bruk av bilder i trykk» gir bare mening for foto */
  showPrintUse: boolean;
  /** Hint og etiketter i editoren (feltene har samme struktur for begge typer) */
  editor: {
    coverageHint: string;
    deliverableLabel: string;
    deliverableHint: string;
    usageHint: string;
    deliveryHint: string;
  };
}

export const PORTALS: Record<PortalKind, PortalConfig> = {
  photo: {
    label: "Eventfoto",
    slug: "foto",
    eyebrow: "Eventfotografering",
    title: (n) => `Eventfotografering for ${n}`,
    intro: "Her finner du deres avtalte fotopakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.",
    cta: "Send et fotobehov",
    formHeading: "Send et fotobehov",
    galleryTitle: "Bilder fra oppdrag",
    needNoun: "fotobehovet",
    heroPlaceholder: "Vi fanger øyeblikkene",
    showPrintUse: true,
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
    eyebrow: "Eventfilm",
    title: (n) => `Eventfilm for ${n}`,
    intro: "Her finner du deres avtalte filmpakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.",
    cta: "Send et filmbehov",
    formHeading: "Send et filmbehov",
    galleryTitle: "Bilder fra oppdrag",
    needNoun: "filmbehovet",
    heroPlaceholder: "Vi forteller historiene",
    showPrintUse: false,
    editor: {
      coverageHint: "F.eks. «Inntil 4 timer filming»",
      deliverableLabel: "Leveranse",
      deliverableHint: "F.eks. «Én ferdig redigert aftermovie på 1–2 minutter»",
      usageHint: "F.eks. «Full ubegrenset digital bruksrett»",
      deliveryHint: "F.eks. «Levering innen 10 virkedager»",
    },
  },
};

export function isPortalKind(v: unknown): v is PortalKind {
  return typeof v === "string" && (PORTAL_KINDS as readonly string[]).includes(v);
}

/** Leser en portaltype fra URL (?tjeneste=film) eller database. Ukjent verdi gir null. */
export function parsePortalKind(v: string | null | undefined): PortalKind | null {
  if (!v) return null;
  if (isPortalKind(v)) return v;
  return PORTAL_KINDS.find((k) => PORTALS[k].slug === v) ?? null;
}

/** Rekkefølgen portalene vises i (faner, lister). */
export function sortKinds<T extends { kind: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => PORTAL_KINDS.indexOf(a.kind as PortalKind) - PORTAL_KINDS.indexOf(b.kind as PortalKind));
}

export const portalLabel = (kind: string): string => (isPortalKind(kind) ? PORTALS[kind].label : kind);
