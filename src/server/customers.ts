import { Prisma, type PublishedVersion } from "@prisma/client";
import { db } from "./db";
import { EMPTY_CONTACT, type CustomerContact } from "@/lib/customer-contact";
import { appUrl } from "./app-url";
import { generateToken, sha256, encryptText, decryptText } from "./crypto";
import { Content, contentSchema, emptyContent, parseContent, canonical, publishProblems, remapImageIds } from "@/lib/content";
import { PORTAL_KINDS, sortKinds, type PortalKind } from "@/lib/portal";

function customerUrl(token: string): string {
  return `${appUrl()}/k/${token}`;
}

/** Oppretter kunden med én upublisert portal per valgt type (standard: bare eventfoto). */
export async function createCustomer(name: string, contact: CustomerContact = EMPTY_CONTACT, kinds: PortalKind[] = ["photo"]) {
  const token = generateToken();
  const unique = PORTAL_KINDS.filter((k) => kinds.includes(k));
  if (unique.length === 0) throw new Error("Kunden må ha minst én portal.");
  return db.customer.create({
    data: {
      name: name.trim(),
      ...contact,
      tokenHash: sha256(token),
      tokenEnc: encryptText(token),
      portals: { create: unique.map((kind) => ({ kind, draft: { create: { content: JSON.stringify(emptyContent(kind)) } } })) },
    },
  });
}

/**
 * Legger en portal til en kunde som ikke har den. Kontaktperson og vilkår kopieres fra en eksisterende portal
 * (utkastet), slik at admin slipper å skrive dem på nytt. Priser og pakker kopieres ikke.
 */
export async function addPortal(customerId: string, kind: PortalKind): Promise<boolean> {
  const customer = await db.customer.findUnique({ where: { id: customerId }, include: { portals: { include: { draft: true } } } });
  if (!customer) return false;
  if (customer.portals.some((p) => p.kind === kind)) return false;
  const content = emptyContent(kind);
  const source = sortKinds(customer.portals).find((p) => p.draft);
  if (source?.draft) {
    const s = parseContent(source.draft.content);
    Object.assign(content, { contactName: s.contactName, contactEmail: s.contactEmail, validityText: s.validityText, practical: s.practical });
  }
  try {
    await db.portal.create({ data: { customerId, kind, draft: { create: { content: JSON.stringify(content) } } } });
  } catch (e) {
    // To samtidige forsøk: den ene taper på unik-nøkkelen (customerId + kind) og har da ingenting å gjøre.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  return true;
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

export class DraftConflictError extends Error {
  constructor() { super("draft_conflict"); this.name = "DraftConflictError"; }
}

/** Portalen finnes alltid for kunder opprettet før portaler ble innført (migrasjonen lager foto-portalen). */
async function portalIdOrThrow(customerId: string, kind: PortalKind): Promise<string> {
  const portal = await db.portal.findUnique({ where: { customerId_kind: { customerId, kind } }, select: { id: true } });
  if (!portal) throw new Error(`Kunden har ingen ${kind}-portal.`);
  return portal.id;
}

/**
 * Lagrer utkastet til en portal (standard: eventfoto). Med `expectedUpdatedAt` (tidspunktet utkastet hadde da siden ble åpnet)
 * avvises lagringen med DraftConflictError hvis noen andre har lagret i mellomtiden (annen fane eller administrator), i stedet for å
 * overskrive uten å si fra. Uten verdien overskrives utkastet. Gir utkastets nye tidspunkt.
 * Kundenavnet gjelder hele kunden og lagres sammen med utkastet.
 */
export async function saveDraft(customerId: string, name: string, content: Content, expectedUpdatedAt?: string | null, kind: PortalKind = "photo"): Promise<{ updatedAt: Date }> {
  const parsed = contentSchema.parse(content);
  const existing = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const portalId = await portalIdOrThrow(customerId, kind);
  const clearRename = existing.needsRename && name.trim() !== existing.name;
  const expected = expectedUpdatedAt ? new Date(expectedUpdatedAt) : null;
  if (expected && Number.isNaN(expected.getTime())) throw new DraftConflictError();
  return db.$transaction(async (tx) => {
    if (expected) {
      const r = await tx.portalDraft.updateMany({ where: { portalId, updatedAt: expected }, data: { content: JSON.stringify(parsed) } });
      if (r.count === 0) throw new DraftConflictError();
    } else {
      await tx.portalDraft.upsert({
        where: { portalId },
        create: { portalId, content: JSON.stringify(parsed) },
        update: { content: JSON.stringify(parsed) },
      });
    }
    await tx.customer.update({
      where: { id: customerId },
      data: { name: name.trim(), ...(clearRename ? { needsRename: false } : {}) },
    });
    const draft = await tx.portalDraft.findUniqueOrThrow({ where: { portalId } });
    return { updatedAt: draft.updatedAt };
  });
}

/** Erstatter utkastet med innholdet i en publisert versjon. Publiserte versjoner påvirkes ikke. */
export async function restoreVersionAsDraft(customerId: string, versionNumber: number, kind: PortalKind = "photo"): Promise<boolean> {
  const portalId = await portalIdOrThrow(customerId, kind);
  const v = await db.publishedVersion.findUnique({ where: { portalId_number: { portalId, number: versionNumber } } });
  if (!v) return false;
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  await saveDraft(customerId, customer.name, parseContent(v.content), undefined, kind);
  return true;
}

/** Kopierer kunden med alle portalene (utkast, ikke versjoner), bildebiblioteket og en ny lenke. */
export async function duplicateCustomer(sourceId: string) {
  const src = await db.customer.findUniqueOrThrow({ where: { id: sourceId }, include: { portals: { include: { draft: true } }, assets: true } });
  const token = generateToken();
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
  for (const p of sortKinds(src.portals)) {
    const kind = p.kind as PortalKind;
    const content = p.draft ? parseContent(p.draft.content) : emptyContent(kind);
    const copied = remapImageIds(content, (id) => idMap.get(id));
    await db.portal.create({ data: { customerId: created.id, kind, draft: { create: { content: JSON.stringify(copied) } } } });
  }
  return created;
}

export async function publish(customerId: string, kind: PortalKind = "photo") {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const portal = await db.portal.findUniqueOrThrow({ where: { customerId_kind: { customerId, kind } }, include: { draft: true } });
  const portalId = portal.id;
  const content = parseContent(portal.draft?.content ?? JSON.stringify(emptyContent(kind)));
  const problems = publishProblems(content, customer.name, customer.needsRename);
  if (problems.length) return { ok: false as const, problems };
  // To samtidige publiseringer kan velge samme versjonsnummer. Den ene taper på unik-nøkkelen
  // (portalId + number) og prøver da på nytt med neste nummer.
  let version;
  for (let attempt = 0; ; attempt++) {
    try {
      version = await db.$transaction(async (tx) => {
        const last = await tx.publishedVersion.aggregate({ where: { portalId }, _max: { number: true } });
        const v = await tx.publishedVersion.create({
          data: {
            portalId,
            number: (last._max.number ?? 0) + 1,
            customerName: customer.name,
            label: content.agreementLabel,
            content: canonical(content),
          },
        });
        await tx.portal.update({ where: { id: portalId }, data: { currentVersionId: v.id } });
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

export interface PublishedPortal {
  kind: PortalKind;
  version: PublishedVersion;
  content: Content;
}

/** Alle publiserte portaler bak en kundelenke, i fast rekkefølge (foto, film). Null hvis lenken ikke gir tilgang til noe. */
export async function resolvePublishedPortals(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const c = await db.customer.findUnique({
    where: { tokenHash: sha256(token) },
    include: { portals: { include: { currentVersion: true } } },
  });
  if (!c || !c.active) return null;
  const portals: PublishedPortal[] = sortKinds(c.portals).flatMap((p) =>
    p.currentVersion ? [{ kind: p.kind as PortalKind, version: p.currentVersion, content: parseContent(p.currentVersion.content) }] : [],
  );
  if (portals.length === 0) return null;
  return { customerId: c.id, portals };
}

/**
 * Oppslag for kundelenken. Alle ugyldige tilstander gir null (samme melding), også når ingen portal er publisert.
 * Gir den ønskede portalen hvis den er publisert, ellers den første publiserte. `available` er alle publiserte portaler (fanene).
 */
export async function resolvePublished(token: string, wanted?: PortalKind | null) {
  const all = await resolvePublishedPortals(token);
  if (!all) return null;
  const chosen = all.portals.find((p) => p.kind === wanted) ?? all.portals[0];
  return {
    customerId: all.customerId,
    customerName: chosen.version.customerName,
    kind: chosen.kind,
    version: chosen.version,
    content: chosen.content,
    available: all.portals.map((p) => p.kind),
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
