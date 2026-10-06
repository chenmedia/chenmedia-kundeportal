import { db } from "@/server/db";
import { createCustomer, getRawToken, publish } from "@/server/customers";
import { obosContent } from "@/server/seed-data";
import { InquiryInput } from "@/lib/inquiry";
import type { PortalKind } from "@/lib/portal";

export const portalIdOf = async (customerId: string, kind: PortalKind = "photo") =>
  (await db.portal.findUniqueOrThrow({ where: { customerId_kind: { customerId, kind } } })).id;

/** Utkastraden til en portal (standard: eventfoto). */
export const draftOf = async (customerId: string, kind: PortalKind = "photo") =>
  db.portalDraft.findUniqueOrThrow({ where: { portalId: await portalIdOf(customerId, kind) } });

export async function setDraftContent(customerId: string, content: unknown, kind: PortalKind = "photo") {
  await db.portalDraft.update({ where: { portalId: await portalIdOf(customerId, kind) }, data: { content: JSON.stringify(content) } });
}

export async function makeCustomer(name = "Testkunde", kinds: PortalKind[] = ["photo"]) {
  const c = await createCustomer(name, undefined, kinds);
  for (const kind of kinds) await setDraftContent(c.id, obosContent(), kind);
  return c;
}

export async function makePublished(name = "Testkunde") {
  const c = await makeCustomer(name);
  const r = await publish(c.id);
  if (!r.ok) throw new Error(r.problems.join());
  return { customer: c, token: (await getRawToken(c.id))!, versionId: r.version.id };
}

export function validInput(over: Partial<InquiryInput> = {}): InquiryInput {
  return {
    packageId: "pkg_lite", eventName: "Sommerfest", dateUnknown: false, eventDate: "2099-06-15",
    locationUnknown: false, location: "Oslo", timeframe: "", description: "Vi trenger en fotograf til festen.",
    contactName: "Test Person", contactEmail: "test@example.com", contactPhone: "", express: false, printUse: false, ...over,
  };
}

// Minimal gyldig 1x1 PNG
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
