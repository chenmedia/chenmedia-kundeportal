import { db } from "./db";
import { appUrl } from "./app-url";
import { logError } from "./log";
import { formatCalendarDate, formatPackagePrice, todayInOslo } from "@/lib/format";
import type { InquirySnapshot } from "@/lib/inquiry";
import type { Customer, Inquiry } from "@prisma/client";

/**
 * Overføring av forespørsler til HubSpot (adapter mot ekstern tjeneste, som email.ts).
 *
 * Portalen eier skjemaet og prisøyeblikksbildet. Etter innsending finner eller oppretter vi kontakt og selskap i HubSpot,
 * oppretter en deal i salgspipelinen (steg «Opportunity identified») og en oppgave til eieren (som gir varsel fra HubSpot). Deretter følges forespørselen
 * opp i HubSpot, der status flyttes manuelt.
 *
 * Hvert steg lagres på CrmSync-raden (bare ID-er), så en feil midt i kan prøves på nytt uten duplikater: deals finnes
 * på portalreferansen (egen unik egenskap), kontakter på e-post og selskaper på navn.
 */

const API = "https://api.hubapi.com";
const TIMEOUT_MS = 8000;
/** En overføring som står som «syncing» lenger enn dette regnes som forlatt. */
const CLAIM_STALE_MS = 2 * 60_000;
const MAX_AUTO_ATTEMPTS = 5;
const MAX_AUTO_AGE_MS = 7 * 24 * 3600_000;

// HubSpot-definerte standardassosiasjoner (typeId): kontakt→selskap, deal→kontakt, deal→selskap, oppgave→deal.
const ASSOC = { dealToContact: 3, dealToCompany: 5, taskToDeal: 216 } as const;

/** Standard «Sales Pipeline» og steget «PRESENTATION - OPPORTUNITY IDENTIFIED» (HubSpots faste ID-er). Kan overstyres med miljøvariabler. */
const DEFAULT_PIPELINE = "default";
const DEFAULT_STAGE = "appointmentscheduled";
export const hubspotPipelineId = () => process.env.HUBSPOT_PIPELINE_ID || DEFAULT_PIPELINE;
export const hubspotStageId = () => process.env.HUBSPOT_STAGE_NEW || DEFAULT_STAGE;

/** Integrasjonen er på så snart tilgangstokenet er satt. */
export function hubspotConfigured(): boolean {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

/** Lenke til dealen i HubSpot (krever HUBSPOT_PORTAL_ID). Standard datasenter er EU1, som kontoen bruker. */
export function hubspotDealUrl(dealId: string): string | null {
  const portal = process.env.HUBSPOT_PORTAL_ID;
  if (!portal) return null;
  const host = process.env.HUBSPOT_UI_DOMAIN || "app-eu1.hubspot.com";
  return `https://${host}/contacts/${portal}/record/0-3/${dealId}`;
}

type Json = Record<string, unknown>;

export async function hs(method: string, path: string, body?: Json): Promise<Json | null> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Svarteksten leses aldri inn i feilmeldinger eller logger: den kan inneholde personopplysninger.
  if (!res.ok) throw new HubspotError(res.status);
  if (res.status === 204) return null;
  return (await res.json().catch(() => null)) as Json | null;
}

export class HubspotError extends Error {
  constructor(public status: number) {
    super(`http_${status}`);
  }
}

const firstId = (r: Json | null): string | null => {
  const results = (r?.results as { id?: string }[] | undefined) ?? [];
  return results[0]?.id ?? null;
};

async function findContact(email: string): Promise<string | null> {
  return firstId(await hs("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email.toLowerCase() }] }],
    properties: ["email"], limit: 1,
  }));
}

/** Finner kontakten på e-post, ellers opprettes den. Eksisterende kontakter endres aldri. */
async function ensureContact(i: Pick<Inquiry, "contactName" | "contactEmail" | "contactPhone">): Promise<string> {
  const found = await findContact(i.contactEmail);
  if (found) return found;
  const [first, ...rest] = i.contactName.trim().split(/\s+/);
  try {
    const r = await hs("POST", "/crm/v3/objects/contacts", {
      properties: {
        email: i.contactEmail.toLowerCase(),
        firstname: first ?? "",
        ...(rest.length ? { lastname: rest.join(" ") } : {}),
        ...(i.contactPhone ? { phone: i.contactPhone } : {}),
      },
    });
    return String(r?.id);
  } catch (e) {
    // To samtidige overføringer kan opprette samme kontakt: da finnes den nå.
    if (e instanceof HubspotError && e.status === 409) {
      const again = await findContact(i.contactEmail);
      if (again) return again;
    }
    throw e;
  }
}

async function ensureCompany(name: string): Promise<string> {
  const found = firstId(await hs("POST", "/crm/v3/objects/companies/search", {
    filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: name }] }],
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    properties: ["name"], limit: 1,
  }));
  if (found) return found;
  const r = await hs("POST", "/crm/v3/objects/companies", { properties: { name } });
  return String(r?.id);
}

async function associate(from: string, fromId: string, to: string, toId: string) {
  await hs("PUT", `/crm/v4/objects/${from}/${fromId}/associations/default/${to}/${toId}`);
}

function dealDescription(i: Inquiry, s: InquirySnapshot): string {
  const pkg = s.package;
  const price = pkg ? formatPackagePrice(pkg) : null;
  return [
    `Forespørsel ${i.reference} fra kundeportalen.`,
    `Pakke: ${pkg ? `${pkg.name} (${price!.label.toLowerCase()} ${price!.amount} eks. mva.)` : "Usikker / annet behov"}`,
    `Avtale: ${s.agreementLabel} (versjon ${s.versionNumber})`,
    `Dato: ${i.dateUnknown || !i.eventDate ? "Ikke avklart" : formatCalendarDate(i.eventDate)}`,
    `Sted: ${i.locationUnknown || !i.location ? "Ikke avklart" : i.location}`,
    i.timeframe ? `Ønsket tidsrom: ${i.timeframe}` : null,
    i.express ? "Ønsker levering innen 24 timer" : null,
    i.printUse ? "Ønsker å avklare bruk av bilder i trykk" : null,
    "",
    "Beskrivelse:",
    i.description,
  ].filter((l): l is string => l !== null).join("\n");
}

/** «SELSKAP // ARRANGEMENT - EVENTPHOTO eller EVENTFILM - DATO». Dato som dd/mm/åååå, eller «dato ikke avklart». */
export function dealName(i: Pick<Inquiry, "eventName" | "eventDate" | "dateUnknown">, s: InquirySnapshot): string {
  const kind = s.package && /film|video/i.test(`${s.package.name} ${s.package.description ?? ""}`) ? "EVENTFILM" : "EVENTPHOTO";
  const date = i.dateUnknown || !i.eventDate ? "dato ikke avklart" : i.eventDate.split("-").reverse().join("/");
  return `${s.customerName} // ${i.eventName} - ${kind} - ${date}`.slice(0, 250);
}

/** Siste dag i inneværende måned (norsk tid), som midnatt UTC: forventet closedate. */
export function endOfMonthCloseDate(now: Date = new Date()): string {
  const [y, m] = todayInOslo(now).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString();
}

/** Eksisterende kunde = selskapet har vunnet minst én deal i HubSpot fra før. Ellers ny kunde. */
async function dealType(companyId: string): Promise<"newbusiness" | "existingbusiness"> {
  const r = await hs("POST", "/crm/v3/objects/deals/search", {
    filterGroups: [{ filters: [
      { propertyName: "associations.company", operator: "EQ", value: companyId },
      { propertyName: "hs_is_closed_won", operator: "EQ", value: "true" },
    ] }],
    properties: ["dealname"], limit: 1,
  });
  return firstId(r) ? "existingbusiness" : "newbusiness";
}

async function ensureDeal(i: Inquiry, s: InquirySnapshot, companyId: string): Promise<string> {
  const existing = firstId(await hs("POST", "/crm/v3/objects/deals/search", {
    filterGroups: [{ filters: [{ propertyName: "kundeportal_referanse", operator: "EQ", value: i.reference }] }],
    properties: ["kundeportal_referanse"], limit: 1,
  }));
  if (existing) return existing;
  const pkg = s.package;
  const owner = process.env.HUBSPOT_OWNER_ID;
  const r = await hs("POST", "/crm/v3/objects/deals", {
    properties: {
      dealname: dealName(i, s),
      pipeline: hubspotPipelineId(),
      dealstage: hubspotStageId(),
      closedate: endOfMonthCloseDate(),
      dealtype: await dealType(companyId),
      hs_priority: "medium",
      ...(owner ? { hubspot_owner_id: owner } : {}),
      // «Fra»-priser er en nedre grense, ikke et beløp: bare fastpris settes som dealbeløp.
      ...(pkg && pkg.priceType === "fixed" && pkg.priceOre !== null ? { amount: String(pkg.priceOre / 100) } : {}),
      description: dealDescription(i, s),
      kundeportal_referanse: i.reference,
      kundeportal_lenke: `${appUrl()}/admin/foresporsler/${i.id}`,
      kundeportal_pakke: pkg?.name ?? "Usikker / annet behov",
      kundeportal_avtale: `${s.agreementLabel} (versjon ${s.versionNumber})`,
      ...(!i.dateUnknown && i.eventDate ? { arrangementsdato: i.eventDate } : {}),
      ...(!i.locationUnknown && i.location ? { arrangementssted: i.location } : {}),
    },
  });
  return String(r?.id);
}

/** Oppgave til eieren: HubSpot varsler eieren om den (etter egne varslingsinnstillinger). Uten eier lages ingen. */
async function ensureTask(dealId: string, i: Inquiry, s: InquirySnapshot): Promise<string | null> {
  const owner = process.env.HUBSPOT_OWNER_ID;
  if (!owner) return null;
  const r = await hs("POST", "/crm/v3/objects/tasks", {
    properties: {
      hs_task_subject: `Følg opp forespørsel: ${i.eventName} (${s.customerName})`.slice(0, 250),
      hs_task_body: `Ny forespørsel ${i.reference} fra ${s.customerName} i kundeportalen. Åpne dealen for detaljer.`,
      hs_task_status: "NOT_STARTED",
      hs_task_priority: "HIGH",
      hs_task_type: "TODO",
      hs_timestamp: new Date(Date.now() + 24 * 3600_000).toISOString(),
      hubspot_owner_id: owner,
    },
    associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOC.taskToDeal }] }],
  });
  return String(r?.id);
}

function category(e: unknown): string {
  if (e instanceof HubspotError) return e.message;
  if (e instanceof Error && e.name === "TimeoutError") return "timeout";
  return "network_error";
}

type SyncRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>;
const loadRow = (inquiryId: string) =>
  db.crmSync.findUnique({ where: { inquiryId }, include: { inquiry: { include: { customer: true } } } });

async function runSteps(row: SyncRow) {
  const inquiry: Inquiry = row.inquiry;
  const customer: Customer = row.inquiry.customer;
  const snapshot = JSON.parse(inquiry.snapshot) as InquirySnapshot;
  const save = (data: { contactId?: string; companyId?: string; dealId?: string; taskId?: string }) =>
    db.crmSync.update({ where: { id: row.id }, data });

  const contactId = row.contactId ?? (await ensureContact(inquiry));
  if (!row.contactId) await save({ contactId });

  let companyId = row.companyId ?? customer.hubspotCompanyId ?? null;
  if (!companyId) {
    companyId = await ensureCompany(snapshot.customerName);
    await db.customer.update({ where: { id: customer.id }, data: { hubspotCompanyId: companyId } });
  }
  if (!row.companyId) await save({ companyId });

  try {
    await associate("contacts", contactId, "companies", companyId);
  } catch (e) {
    // Selskapet er slettet i HubSpot siden sist: glem koblingen, så neste forsøk finner eller oppretter det på nytt.
    if (e instanceof HubspotError && e.status === 404) {
      await db.customer.update({ where: { id: customer.id }, data: { hubspotCompanyId: null } });
      await db.crmSync.update({ where: { id: row.id }, data: { companyId: null } });
    }
    throw e;
  }

  const dealId = row.dealId ?? (await ensureDeal(inquiry, snapshot, companyId));
  if (!row.dealId) await save({ dealId });
  await associate("deals", dealId, "contacts", contactId);
  await associate("deals", dealId, "companies", companyId);

  if (!row.taskId) {
    const taskId = await ensureTask(dealId, inquiry, snapshot);
    if (taskId) await save({ taskId });
  }
}

/** Overfører én forespørsel. Feil lagres på raden og kaster aldri (som e-postjobber). */
export async function processCrmSync(inquiryId: string): Promise<void> {
  if (!hubspotConfigured()) return;
  const row = await loadRow(inquiryId);
  if (!row || row.status === "synced") return;
  // Ta jobben atomisk: bare én overføring om gangen per forespørsel (innsending, «synk på nytt» og cron kan overlappe).
  const claimed = await db.crmSync.updateMany({
    where: {
      id: row.id,
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "syncing", lastAttemptAt: { lt: new Date(Date.now() - CLAIM_STALE_MS) } },
      ],
    },
    data: { status: "syncing", lastAttemptAt: new Date() },
  });
  if (claimed.count === 0) return;
  try {
    await runSteps(row);
    await db.crmSync.update({ where: { id: row.id }, data: { status: "synced", attempts: { increment: 1 }, errorCategory: null, lastAttemptAt: new Date() } });
  } catch (e) {
    logError("crm.sync", e, { inquiryId });
    await db.crmSync.update({
      where: { id: row.id },
      data: { status: "failed", attempts: { increment: 1 }, errorCategory: category(e), lastAttemptAt: new Date() },
    });
  }
}

/** Daglig sveip (cron): prøver feilede og forlatte overføringer på nytt. Gir opp etter fem forsøk eller sju døgn. */
export async function retryOutstandingCrmSyncs(limit = 25): Promise<number> {
  if (!hubspotConfigured()) return 0;
  const now = Date.now();
  const rows = await db.crmSync.findMany({
    where: {
      attempts: { lt: MAX_AUTO_ATTEMPTS },
      createdAt: { gt: new Date(now - MAX_AUTO_AGE_MS) },
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "syncing", lastAttemptAt: { lt: new Date(now - CLAIM_STALE_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { inquiryId: true },
  });
  for (const r of rows) await processCrmSync(r.inquiryId);
  return rows.length;
}

/** Arkiverer dealer (HubSpot beholder dem 90 dager i papirkurven). 404 regnes som allerede borte. */
export async function archiveDeals(dealIds: string[]): Promise<void> {
  for (const id of dealIds) {
    try {
      await hs("DELETE", `/crm/v3/objects/deals/${encodeURIComponent(id)}`);
    } catch (e) {
      if (!(e instanceof HubspotError && e.status === 404)) throw e;
    }
  }
}

/** Sletter kontakten permanent (GDPR-sletting i HubSpot). 404 regnes som allerede borte. */
export async function gdprDeleteContact(email: string): Promise<void> {
  try {
    await hs("POST", "/crm/v3/objects/contacts/gdpr-delete", { objectId: email.toLowerCase(), idProperty: "email" });
  } catch (e) {
    if (!(e instanceof HubspotError && e.status === 404)) throw e;
  }
}
