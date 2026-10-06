import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { randomReference, sha256 } from "./crypto";
import { allow } from "./rate-limit";
import { resolvePublished } from "./customers";
import { buildEmails, notifyAddress, processInquiryJobs } from "./email";
import { InquiryInput, InquirySnapshot, OTHER_PACKAGE } from "@/lib/inquiry";

export type SubmitResult =
  | { ok: true; reference: string; packageName: string; eventName: string; eventDate: string | null; duplicate: boolean }
  | { ok: false; code: "UNAVAILABLE" | "STALE_VERSION" | "PACKAGE_GONE"; currentVersionId?: string };

export async function submitInquiry(args: {
  token: string;
  versionId: string;
  idempotencyKey: string;
  input: InquiryInput;
}): Promise<SubmitResult> {
  const pub = await resolvePublished(args.token);
  if (!pub) return { ok: false, code: "UNAVAILABLE" };

  // Dobbeltsending (nettverksforsøk): returner den eksisterende forespørselen.
  const existing = await db.inquiry.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
  if (existing) {
    if (existing.customerId !== pub.customerId) return { ok: false, code: "UNAVAILABLE" };
    const snap = JSON.parse(existing.snapshot) as InquirySnapshot;
    return {
      ok: true, duplicate: true, reference: existing.reference,
      packageName: snap.package?.name ?? "Usikker / annet behov",
      eventName: existing.eventName, eventDate: existing.eventDate,
    };
  }

  if (args.versionId !== pub.version.id) return { ok: false, code: "STALE_VERSION", currentVersionId: pub.version.id };

  // Kundetilhørighet og pris hentes alltid fra publisert innhold, aldri fra skjemaet.
  const i = args.input;
  const pkg = i.packageId === OTHER_PACKAGE ? null : pub.content.packages.find((p) => p.id === i.packageId) ?? null;
  if (i.packageId !== OTHER_PACKAGE && !pkg) return { ok: false, code: "PACKAGE_GONE", currentVersionId: pub.version.id };

  const snapshot: InquirySnapshot = {
    customerName: pub.customerName,
    agreementLabel: pub.content.agreementLabel,
    versionNumber: pub.version.number,
    package: pkg,
    addons: pub.content.addons,
    practical: pub.content.practical,
    contactName: pub.content.contactName,
  };

  // Kvitteringen går til adressen kunden oppgir. Uten tak kan skjemaet misbrukes til å sende tekst fra
  // Chen Medias domene til vilkårlige adresser, så hver mottaker får maks tre kvitteringer i døgnet.
  const sendReceipt = await allow(`receipt:${sha256(i.contactEmail.toLowerCase())}`, 3, 24 * 3600);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Forespørsel og begge e-postjobber lagres i én atomisk operasjon (nested create).
      const base = {
        id: crypto.randomUUID(),
        reference: randomReference(),
        customerId: pub.customerId,
        versionId: pub.version.id,
        packageId: pkg ? pkg.id : OTHER_PACKAGE,
        snapshot: JSON.stringify(snapshot),
        eventName: i.eventName,
        eventDate: i.dateUnknown ? null : i.eventDate,
        dateUnknown: i.dateUnknown,
        location: i.locationUnknown ? null : i.location,
        locationUnknown: i.locationUnknown,
        timeframe: i.timeframe || null,
        description: i.description,
        contactName: i.contactName,
        contactEmail: i.contactEmail,
        contactPhone: i.contactPhone || null,
        express: i.express,
        printUse: i.printUse,
        idempotencyKey: args.idempotencyKey,
      };
      const emails = buildEmails(base, snapshot, notifyAddress(pub.content.contactEmail))
        .filter((e) => sendReceipt || e.type !== "customer_receipt");
      const inquiry = await db.inquiry.create({
        data: { ...base, emailJobs: { create: emails.map((e) => ({ ...e, replyTo: e.replyTo ?? null })) } },
      });
      // E-postfeil skal aldri påvirke forespørselen; processInquiryJobs kaster ikke.
      await processInquiryJobs(inquiry.id).catch(() => undefined);
      return {
        ok: true, duplicate: false, reference: inquiry.reference,
        packageName: pkg?.name ?? "Usikker / annet behov", eventName: inquiry.eventName, eventDate: inquiry.eventDate,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        if (target.includes("idempotencyKey")) {
          // Parallell dobbeltsending: hent vinneren.
          const winner = await db.inquiry.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
          if (winner) {
            return { ok: true, duplicate: true, reference: winner.reference, packageName: pkg?.name ?? "Usikker / annet behov", eventName: winner.eventName, eventDate: winner.eventDate };
          }
        }
        continue; // referansekollisjon: prøv ny referanse
      }
      throw e;
    }
  }
  throw new Error("Kunne ikke opprette referanse");
}

export async function updateInquiryFollowUp(id: string, status: string, internalNotes: string) {
  await db.inquiry.update({ where: { id }, data: { status, internalNotes } });
}

/**
 * Sletter alle forespørsler fra en kontakt-e-postadresse (innsynskrav/sletting). E-postjobbene følger med (cascade).
 * Gir antall slettede forespørsler.
 */
export async function deleteInquiriesByEmail(email: string): Promise<number> {
  const r = await db.inquiry.deleteMany({ where: { contactEmail: { equals: email.trim(), mode: "insensitive" } } });
  return r.count;
}

/** E-postjobber slettes med cascade. Kundeinnhold og versjoner påvirkes ikke. */
export async function deleteInquiry(id: string) {
  await db.inquiry.delete({ where: { id } });
}
