import type { AddonContent, PackageContent } from "./content";

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
  if (a.basis === "percent") return `+ ${String(a.percent ?? 0).replace(".", ",")} %`;
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


/** Størst beløp som kan skrives inn (kr). Fanger tastefeil som ellers ville blitt lagret som milliardpriser. */
const MAX_KR = 100_000_000;

/**
 * Tolker et beløp skrevet på norsk og gir øre, eller null hvis teksten ikke kan tolkes.
 * Komma er desimaltegn. Punktum er tusenskille når det følges av nøyaktig tre sifre
 * («16.000» = 16 000 kr, «1.250,50» = 1 250,50 kr), ellers desimaltegn («16.5» = 16,50 kr).
 */
export function parseKroner(input: string): number | null {
  const t = input.replace(/[\s\u00a0\u202f]/g, "");
  if (!t || !/^\d[\d.,]*$/.test(t)) return null;
  const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
  let norm: string;
  if (t.includes(",")) {
    const parts = t.split(",");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
    const int = parts[0].includes(".") ? (THOUSANDS.test(parts[0]) ? parts[0].replace(/\./g, "") : null) : parts[0];
    if (int === null) return null;
    norm = `${int}.${parts[1]}`;
  } else if (t.includes(".")) {
    if (THOUSANDS.test(t)) norm = t.replace(/\./g, "");
    else if (/^\d+\.\d{1,2}$/.test(t)) norm = t;
    else return null;
  } else {
    norm = t;
  }
  const n = Number(norm);
  if (!Number.isFinite(n) || n > MAX_KR) return null;
  return Math.round(n * 100);
}
