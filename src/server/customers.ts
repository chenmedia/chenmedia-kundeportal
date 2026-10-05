import { Prisma } from "@prisma/client";
import { db } from "./db";
import { EMPTY_CONTACT, type CustomerContact } from "@/lib/customer-contact";
import { appUrl } from "./app-url";
import { generateToken, sha256, encryptText, decryptText } from "./crypto";
import { Content, contentSchema, emptyContent, parseContent, canonical, publishProblems, remapImageIds } from "@/lib/content";

function customerUrl(token: string): string {
  return `${appUrl()}/k/${token}`;
}

export async function createCustomer(name: string, contact: CustomerContact = EMPTY_CONTACT) {
  const token = generateToken();
  return db.customer.create({
    data: {
      name: name.trim(),
      ...contact,
      tokenHash: sha256(token),
      tokenEnc: encryptText(token),
      draft: { create: { content: JSON.stringify(emptyContent()) } },
    },
  });
}

export async function getAdminCustomerLink(customerId: string): Promise<string | null> {
  const c = await db.customer.findUnique({ where: { id: customerId } });
  if (!c) return null;
  try {
    return customerUrl(decryptText(c.tokenEnc));
  } catch {
    return null;
  }
}

export async function getRawToken(customerId: string): Promise<string | null> {
  const c = await db.customer.findUnique({ where: { id: customerId } });
  return c ? decryptText(c.tokenEnc) : null;
}

export async function rotateToken(customerId: string) {
  const token = generateToken();
  await db.customer.update({ where: { id: customerId }, data: { tokenHash: sha256(token), tokenEnc: encryptText(token) } });
}

export async function setActive(customerId: string, active: boolean) {
  await db.customer.update({ where: { id: customerId }, data: { active } });
}

export async function saveDraft(customerId: string, name: string, content: Content) {
  const parsed = contentSchema.parse(content);
  const existing = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const clearRename = existing.needsRename && name.trim() !== existing.name;
  await db.$transaction([
    db.customer.update({
      where: { id: customerId },
      data: { name: name.trim(), ...(clearRename ? { needsRename: false } : {}) },
    }),
    db.customerDraft.upsert({
      where: { customerId },
      create: { customerId, content: JSON.stringify(parsed) },
      update: { content: JSON.stringify(parsed) },
    }),
  ]);
}

export async function duplicateCustomer(sourceId: string) {
  const src = await db.customer.findUniqueOrThrow({ where: { id: sourceId }, include: { draft: true, assets: true } });
  const token = generateToken();
  const content = src.draft ? parseContent(src.draft.content) : emptyContent();
  const created = await db.customer.create({
    data: {
      name: `${src.name} (kopi)`,
      needsRename: true,
      tokenHash: sha256(token),
      tokenEnc: encryptText(token),
    },
  });
  // Bilder kopieres som egne rader (samme fil) slik at kundene er isolert fra hverandre.
  const idMap = new Map<string, string>();
  for (const a of src.assets) {
    const copy = await db.mediaAsset.create({
      data: {
        customerId: created.id, storageKey: a.storageKey, originalName: a.originalName,
        mimeType: a.mimeType, width: a.width, height: a.height, altText: a.altText,
      },
    });
    idMap.set(a.id, copy.id);
  }
  // Nye pakke-/tillegg-ID-er er ikke nødvendig, men bildereferansene må pekes om.
  const copied = remapImageIds(content, (id) => idMap.get(id));
  await db.customerDraft.create({ data: { customerId: created.id, content: JSON.stringify(copied) } });
  return created;
}

export async function publish(customerId: string) {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId }, include: { draft: true } });
  const content = parseContent(customer.draft?.content ?? JSON.stringify(emptyContent()));
  const problems = publishProblems(content, customer.name, customer.needsRename);
  if (problems.length) return { ok: false as const, problems };
  // To samtidige publiseringer kan velge samme versjonsnummer. Den ene taper på unik-nøkkelen
  // (customerId + number) og prøver da på nytt med neste nummer.
  let version;
  for (let attempt = 0; ; attempt++) {
    try {
      version = await db.$transaction(async (tx) => {
        const last = await tx.publishedVersion.aggregate({ where: { customerId }, _max: { number: true } });
        const v = await tx.publishedVersion.create({
          data: {
            customerId,
            number: (last._max.number ?? 0) + 1,
            customerName: customer.name,
            label: content.agreementLabel,
            content: canonical(content),
          },
        });
        await tx.customer.update({ where: { id: customerId }, data: { currentVersionId: v.id } });
        return v;
      });
      break;
    } catch (e) {
      const conflict = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!conflict || attempt >= 4) throw e;
    }
  }
  return { ok: true as const, version };
}

/** Oppslag for kundelenken. Alle ugyldige tilstander gir null (samme melding). */
export async function resolvePublished(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const c = await db.customer.findUnique({
    where: { tokenHash: sha256(token) },
    include: { currentVersion: true },
  });
  if (!c || !c.active || !c.currentVersion) return null;
  return {
    customerId: c.id,
    customerName: c.currentVersion.customerName,
    version: c.currentVersion,
    content: parseContent(c.currentVersion.content),
  };
}


export async function customerExists(id: string): Promise<boolean> {
  return !!(await db.customer.findUnique({ where: { id }, select: { id: true } }));
}

/** Sant hvis alle bildene finnes og tilhører kunden. */
export async function assetsBelongToCustomer(assetIds: string[], customerId: string): Promise<boolean> {
  if (assetIds.length === 0) return true;
  const n = await db.mediaAsset.count({ where: { id: { in: assetIds }, customerId } });
  return n === assetIds.length;
}

export async function updateCustomerContact(id: string, contact: CustomerContact) {
  await db.customer.update({ where: { id }, data: contact });
}
