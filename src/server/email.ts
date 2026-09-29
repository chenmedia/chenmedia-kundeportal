import { db } from "./db";
import { formatCalendarDate, formatKr, formatPackagePrice, InquirySnapshot } from "@/lib/content";
import type { Inquiry } from "@prisma/client";

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
  return [
    {
      type: "team_notification",
      recipient: notifyTo,
      replyTo: inq.contactEmail,
      subject: `Ny forespørsel fra ${s.customerName}: ${inq.eventName} (${inq.reference})`,
      body: `Ny forespørsel fra ${s.customerName}.\n\n${body}`,
    },
    {
      type: "customer_receipt",
      recipient: inq.contactEmail,
      subject: `Vi har mottatt forespørselen din (${inq.reference})`,
      body:
        `Hei ${inq.contactName},\n\nTakk! Vi har mottatt forespørselen din. Kai følger opp for å avklare tilgjengelighet og detaljer.\n\n` +
        `Dette er en kvittering på forespørselen, ikke en bekreftet booking. Oppdraget er bekreftet først når du har fått bekreftelse fra Chen Media.\n\n` +
        `Du har sendt inn:\n\n${body}\n\nSpørsmål? Kontakt Kai: ${process.env.NOTIFY_EMAIL || "kai@chenmedia.no"}\n\nChen Media`,
    },
  ];
}

async function sendViaResend(d: { recipient: string; replyTo: string | null; subject: string; body: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [d.recipient],
      reply_to: d.replyTo ?? undefined,
      subject: d.subject,
      text: d.body,
    }),
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
  try {
    await sendViaResend(job);
    await db.emailJob.update({
      where: { id: jobId },
      data: { status: "sent", attempts: { increment: 1 }, lastAttemptAt: new Date(), errorCategory: null },
    });
  } catch (e) {
    const cat = e instanceof Error && /^http_\d+$/.test(e.message) ? e.message : "network_error";
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

export { formatKr };
