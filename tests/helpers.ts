import { db } from "@/server/db";
import { createCustomer, getRawToken, publish } from "@/server/customers";
import { obosContent } from "@/server/seed-data";
import { InquiryInput } from "@/lib/content";

export async function makeCustomer(name = "Testkunde") {
  const c = await createCustomer(name);
  await db.customerDraft.update({ where: { customerId: c.id }, data: { content: JSON.stringify(obosContent()) } });
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
