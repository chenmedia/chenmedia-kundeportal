/**
 * Automatisk prioritet på dealen i HubSpot. Ren logikk uten tjenestekall, så reglene er enkle å lese og justere.
 *
 * Poeng for størrelsen på forespørselen (pakkeprisen, eller fra-prisen som minstebeløp), og for kunden
 * (antall vunne deals og samlet verdi hos selskapet, LTV). Ukjent budsjett teller ikke for eller imot.
 */

export type Priority = "low" | "medium" | "high";

/** Terskler i hele kroner eks. mva. Juster her. */
export const PRIORITY_RULES = {
  budgetLarge: 30_000,
  budgetMedium: 10_000,
  ltvHigh: 100_000,
  repeatWins: 3,
  highAt: 3,
  lowAt: -1,
} as const;

export interface PriorityInput {
  /** Kroner. null = ukjent (annet behov). */
  amountKr: number | null;
  /** Antall vunne deals hos selskapet fra før. */
  wonCount: number;
  /** Samlet beløp på vunne deals hos selskapet (kroner). */
  ltvKr: number;
}

export function dealPriority(i: PriorityInput): { priority: Priority; score: number; reason: string } {
  const r = PRIORITY_RULES;
  let budget = 0;
  if (i.amountKr !== null) budget = i.amountKr >= r.budgetLarge ? 2 : i.amountKr >= r.budgetMedium ? 1 : -1;
  let customer = 0;
  if (i.wonCount >= r.repeatWins || i.ltvKr >= r.ltvHigh) customer = 2;
  else if (i.wonCount >= 1) customer = 1;

  const score = budget + customer;
  const priority: Priority = score >= r.highAt ? "high" : score <= r.lowAt ? "low" : "medium";
  const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;
  const reason = [
    i.amountKr === null ? "budsjett ukjent" : `budsjett fra ${kr(i.amountKr)}`,
    i.wonCount === 0 ? "ny kunde" : `${i.wonCount} vunne deals, LTV ${kr(i.ltvKr)}`,
  ].join(", ");
  return { priority, score, reason };
}
