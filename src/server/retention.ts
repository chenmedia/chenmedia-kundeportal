import { db } from "./db";

/**
 * Oppbevaring av personopplysninger (kontaktperson, e-post, telefon og fritekst i forespørsler).
 * Begge reglene er valgfrie og av som standard: bestem fristene, og sett miljøvariablene, før noe slettes.
 *
 * - INQUIRY_RETENTION_MONTHS: avsluttede forespørsler (status «Avsluttet») slettes når de ikke er endret på så mange måneder.
 * - EMAIL_BODY_RETENTION_DAYS: innholdet i sendte e-poster (som gjentar alle opplysningene) tømmes etter så mange dager.
 */
function positiveInt(name: string, max: number): number | null {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

export const inquiryRetentionMonths = () => positiveInt("INQUIRY_RETENTION_MONTHS", 120);
export const emailBodyRetentionDays = () => positiveInt("EMAIL_BODY_RETENTION_DAYS", 3650);

export const REDACTED = "(innholdet er slettet etter oppbevaringsfristen)";

export async function runRetention(now: Date = new Date()): Promise<{ inquiriesDeleted: number; emailsRedacted: number }> {
  let inquiriesDeleted = 0;
  let emailsRedacted = 0;

  const months = inquiryRetentionMonths();
  if (months) {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    // E-postjobbene slettes med forespørselen (cascade).
    inquiriesDeleted = (await db.inquiry.deleteMany({ where: { status: "closed", updatedAt: { lt: cutoff } } })).count;
  }

  const days = emailBodyRetentionDays();
  if (days) {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const sent = { status: "sent", lastAttemptAt: { lt: cutoff }, NOT: { body: REDACTED } };
    // Kvitteringens mottaker og Reply-To er kundens adresse og slettes sammen med innholdet. Teamets mottakeradresse er
    // ikke personopplysning. Kvitteringene tas først: etter tømmingen matcher ikke jobbene filteret lenger.
    const receipts = await db.emailJob.updateMany({ where: { ...sent, type: "customer_receipt" }, data: { body: REDACTED, replyTo: null, recipient: "(slettet)" } });
    const others = await db.emailJob.updateMany({ where: sent, data: { body: REDACTED, replyTo: null } });
    emailsRedacted = receipts.count + others.count;
  }

  return { inquiriesDeleted, emailsRedacted };
}
