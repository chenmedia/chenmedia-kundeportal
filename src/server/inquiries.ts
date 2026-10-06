import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { randomReference, sha256 } from "./crypto";
import { allow } from "./rate-limit";
import { resolvePublished } from "./customers";
import { buildEmails, notifyAddress, processInquiryJobs } from "./email";
import { archiveDeals, gdprDeleteContact, hubspotConfigured } from "./hubspot";
import { InquiryInput, InquirySnapshot, OTHER_PACKAGE } from "@/lib/inquiry";

export type SubmitResult =
  | { ok: true; inquiryId: string; reference: string; packageName: string; eventName: string; eventDate: string | null; duplicate: boolean }
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
      ok: true, duplicate: true, inquiryId: existing.id, reference: existing.reference,
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
      // Forespørsel, e-postjobber og (når HubSpot er koblet til) overføringsraden lagres i én atomisk operasjon (nested create).
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
      // HubSpot varsler eieren via oppgaven som lages der, så teamvarsel på e-post sendes bare uten HubSpot (eller uten eier).
      const hubspotNotifies = hubspotConfigured() && !!process.env.HUBSPOT_OWNER_ID;
      const emails = buildEmails(base, snapshot, notifyAddress(pub.content.contactEmail))
        .filter((e) => (sendReceipt || e.type !== "customer_receipt") && (!hubspotNotifies || e.type !== "team_notification"));
      const inquiry = await db.inquiry.create({
        data: {
          ...base,
          emailJobs: { create: emails.map((e) => ({ ...e, replyTo: e.replyTo ?? null })) },
          ...(hubspotConfigured() ? { crmSync: { create: {} } } : {}),
        },
      });
      // E-postfeil skal aldri påvirke forespørselen; processInquiryJobs kaster ikke.
      await processInquiryJobs(inquiry.id).catch(() => undefined);
      return {
        ok: true, duplicate: false, inquiryId: inquiry.id, reference: inquiry.reference,
        packageName: pkg?.name ?? "Usikker / annet behov", eventName: inquiry.eventName, eventDate: inquiry.eventDate,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        if (target.includes("idempotencyKey")) {
          // Parallell dobbeltsending: hent vinneren.
          const winner = await db.inquiry.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
          if (winner) {
            return { ok: true, duplicate: true, inquiryId: winner.id, reference: winner.reference, packageName: pkg?.name ?? "Usikker / annet behov", eventName: winner.eventName, eventDate: winner.eventDate };
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

export interface DeleteByEmailResult {
  count: number;
  /** Antall dealer arkivert i HubSpot. */
  archivedDeals: number;
  /** Om kontakten ble slettet permanent i HubSpot (bare når admin ba om det). */
  contactDeleted: boolean;
}

/**
 * Sletter alle forespørsler fra en kontakt-e-postadresse (innsynskrav/sletting). E-postjobbene følger med (cascade).
 * Dealer som er opprettet i HubSpot arkiveres først; feiler det, slettes ingenting (kaster), så vi aldri mister
 * koblingen til dealer som fortsatt inneholder personopplysninger. Kontakten i HubSpot slettes bare når `deleteContact`
 * er satt: den kan være en ordinær kunde som finnes der fra før.
 */
export async function deleteInquiriesByEmail(email: string, opts: { deleteContact?: boolean } = {}): Promise<DeleteByEmailResult> {
  const where = { contactEmail: { equals: email.trim(), mode: "insensitive" as const } };
  const dealIds = (await db.crmSync.findMany({ where: { inquiry: where, dealId: { not: null } }, select: { dealId: true } }))
    .map((r) => r.dealId!);
  if (dealIds.length > 0 || opts.deleteContact) {
    if (!hubspotConfigured()) throw new Error("HubSpot er ikke konfigurert");
  }
  if (dealIds.length > 0) await archiveDeals(dealIds);
  if (opts.deleteContact) await gdprDeleteContact(email.trim());
  const r = await db.inquiry.deleteMany({ where });
  return { count: r.count, archivedDeals: dealIds.length, contactDeleted: !!opts.deleteContact };
}

/** E-postjobber slettes med cascade. Kundeinnhold og versjoner påvirkes ikke. */
export async function deleteInquiry(id: string) {
  await db.inquiry.delete({ where: { id } });
}
