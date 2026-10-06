import { db } from "./db";
import { formatCalendarDate, formatPackagePrice } from "@/lib/format";
import { InquirySnapshot } from "@/lib/inquiry";
import { kindLabel } from "@/lib/service";
import type { Inquiry } from "@prisma/client";
import { logError } from "./log";

export function emailConfigured(): boolean {
  return process.env.EMAIL_PROVIDER === "resend" && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export function notifyAddress(fallback: string): string {
  return process.env.NOTIFY_EMAIL || fallback;
}

interface Draft { type: string; recipient: string; replyTo?: string; subject: string; body: string }

type EmailInquiry = Pick<Inquiry, "reference" | "eventName" | "eventDate" | "dateUnknown" | "location" | "locationUnknown" | "timeframe" | "description" | "contactName" | "contactEmail" | "contactPhone" | "express" | "printUse">;

function details(i: EmailInquiry, s: InquirySnapshot): string {
  const pkg = s.package
    ? `${s.package.name} (${formatPackagePrice(s.package).label.toLowerCase()} ${formatPackagePrice(s.package).amount} eks. mva.)`
    : "Usikker / annet behov";
  return [
    `Referanse: ${i.reference}`,
    `Tjeneste: ${kindLabel(s.kind ?? "photo")}`,
    `Pakke: ${pkg}`,
    `Avtale: ${s.agreementLabel} (versjon ${s.versionNumber})`,
    `Arrangement: ${i.eventName}`,
    `Dato: ${i.dateUnknown || !i.eventDate ? "Ikke avklart" : formatCalendarDate(i.eventDate)}`,
    `Sted: ${i.locationUnknown || !i.location ? "Ikke avklart" : i.location}`,
    i.timeframe ? `Ønsket tidsrom: ${i.timeframe}` : null,
    i.express ? "Ønsker levering innen 24 timer" : null,
    i.printUse ? "Ønsker å avklare bruk av bilder i trykk" : null,
    "",
    "Beskrivelse:",
    i.description,
    "",
    `Kontaktperson: ${i.contactName}`,
    `E-post: ${i.contactEmail}`,
    i.contactPhone ? `Telefon: ${i.contactPhone}` : null,
  ].filter((l): l is string => l !== null).join("\n");
}

export function buildEmails(inq: EmailInquiry, s: InquirySnapshot, notifyTo: string): Draft[] {
  const body = details(inq, s);
  const tjeneste = kindLabel(s.kind ?? "photo");
  return [
    {
      type: "team_notification",
      recipient: notifyTo,
      replyTo: inq.contactEmail,
      subject: `Ny forespørsel (${tjeneste}) fra ${s.customerName}: ${inq.eventName} (${inq.reference})`,
      body: `Ny forespørsel om ${tjeneste.toLowerCase()} fra ${s.customerName}.\n\n${body}`,
    },
    {
      type: "customer_receipt",
      recipient: inq.contactEmail,
      subject: `Vi har mottatt forespørselen din (${inq.reference})`,
      body:
        `Hei ${inq.contactName},\n\nTakk! Vi har mottatt forespørselen din. ${s.contactName || "Chen Media"} følger opp for å avklare tilgjengelighet og detaljer.\n\n` +
        `Dette er en kvittering på forespørselen, ikke en bekreftet booking. Oppdraget er bekreftet først når du har fått bekreftelse fra Chen Media.\n\n` +
        `Du har sendt inn:\n\n${body}\n\nSpørsmål? Kontakt ${s.contactName || "Chen Media"}: ${process.env.NOTIFY_EMAIL || "kai@chenmedia.no"}\n\nChen Media`,
    },
  ];
}

const SEND_TIMEOUT_MS = 8000;
/** En jobb som står som «sending» lenger enn dette regnes som forlatt (funksjonen døde midt i utsendingen). */
const SENDING_STALE_MS = 2 * 60_000;
/** Antall forsøk den automatiske sveipen gir en jobb, og hvor gamle jobber den rører. */
const MAX_AUTO_ATTEMPTS = 5;
const MAX_AUTO_AGE_MS = 3 * 24 * 3600_000;

async function sendViaResend(d: { id: string; recipient: string; replyTo: string | null; subject: string; body: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Samme jobb gir aldri to e-poster, selv om utsendingen gjentas etter et avbrudd (Resend husker nøkkelen i 24 timer).
      "Idempotency-Key": `emailjob-${d.id}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [d.recipient],
      reply_to: d.replyTo ?? undefined,
      subject: d.subject,
      text: d.body,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
}

/** Forsøker å sende én jobb. Feil lagres på jobben og kaster aldri. */
export async function processJob(jobId: string): Promise<void> {
  const job = await db.emailJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "sent") return;
  if (!emailConfigured()) {
    await db.emailJob.update({ where: { id: jobId }, data: { status: "local_preview", lastAttemptAt: new Date() } });
    return;
  }
  // Ta jobben atomisk: bare én utsending om gangen (kunde-forespørsel, «prøv igjen» og cron kan overlappe).
  const claimed = await db.emailJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: { in: ["pending", "failed", "local_preview"] } },
        { status: "sending", lastAttemptAt: { lt: new Date(Date.now() - SENDING_STALE_MS) } },
      ],
    },
    data: { status: "sending", lastAttemptAt: new Date() },
  });
  if (claimed.count === 0) return;
  try {
    await sendViaResend(job);
    await db.emailJob.update({
      where: { id: jobId },
      data: { status: "sent", attempts: { increment: 1 }, lastAttemptAt: new Date(), errorCategory: null },
    });
  } catch (e) {
    logError("email.send", e, { jobId });
    const cat = e instanceof Error && /^http_\d+$/.test(e.message) ? e.message : e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network_error";
    await db.emailJob.update({
      where: { id: jobId },
      data: { status: "failed", attempts: { increment: 1 }, lastAttemptAt: new Date(), errorCategory: cat },
    });
  }
}

export async function processInquiryJobs(inquiryId: string) {
  const jobs = await db.emailJob.findMany({ where: { inquiryId, status: { in: ["pending", "failed"] } } });
  for (const j of jobs) await processJob(j.id);
}

/**
 * Daglig sveip (cron): prøver feilede og forlatte jobber på nytt, så en forespørsel ikke går tapt når e-postleverandøren
 * var nede i øyeblikket kunden sendte. Gir opp etter fem forsøk eller tre døgn (da ligger jobben som «Feilet» i admin).
 */
export async function retryOutstandingJobs(limit = 25): Promise<number> {
  if (!emailConfigured()) return 0;
  const now = Date.now();
  const jobs = await db.emailJob.findMany({
    where: {
      attempts: { lt: MAX_AUTO_ATTEMPTS },
      createdAt: { gt: new Date(now - MAX_AUTO_AGE_MS) },
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "sending", lastAttemptAt: { lt: new Date(now - SENDING_STALE_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const j of jobs) await processJob(j.id);
  return jobs.length;
}
