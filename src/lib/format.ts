import type { AddonContent, PackageContent } from "./content";

const nok = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
function formatKr(ore: number): string {
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

