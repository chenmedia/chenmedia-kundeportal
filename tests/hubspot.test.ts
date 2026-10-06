import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { submitInquiry, deleteInquiriesByEmail } from "@/server/inquiries";
import { processCrmSync, retryOutstandingCrmSyncs, hubspotDealUrl } from "@/server/hubspot";
import { ensureHubspotSetup, PROPERTIES } from "@/server/hubspot-setup";
import { makePublished, validInput } from "./helpers";

type Rec = Record<string, string>;

/** Minimal HubSpot-etterligning i minnet. `fail` kan gi feil for en gitt metode og sti. */
function fakeHubspot() {
  const s = {
    contacts: [] as (Rec & { id: string })[],
    companies: [] as (Rec & { id: string })[],
    deals: [] as (Rec & { id: string })[],
    tasks: [] as { id: string; properties: Rec; associations: unknown }[],
    pipelines: [] as { id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }[],
    props: [] as { name: string }[],
    assoc: [] as string[],
    deleted: [] as string[],
    gdpr: [] as unknown[],
    calls: [] as string[],
    bodies: [] as string[],
    fail: null as null | ((method: string, path: string) => number | null),
    n: 100,
  };
  const json = (data: unknown, status = 200) =>
    Promise.resolve(new Response(status === 204 ? null : JSON.stringify(data), { status }));
  const find = (list: (Rec & { id: string })[], key: string, value: string) => list.filter((r) => r[key] === value).slice(0, 1).map((r) => ({ id: r.id }));
  const handler = async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = url.replace("https://api.hubapi.com", "");
    s.calls.push(`${method} ${path}`);
    if (init.body) s.bodies.push(String(init.body));
    const failure = s.fail?.(method, path);
    if (failure) return json({ message: "secret person@example.com" }, failure);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const id = () => String(++s.n);
    if (path === "/crm/v3/objects/contacts/search") return json({ results: find(s.contacts, "email", body.filterGroups[0].filters[0].value) });
    if (path === "/crm/v3/objects/companies/search") return json({ results: find(s.companies, "name", body.filterGroups[0].filters[0].value) });
    if (path === "/crm/v3/objects/deals/search") return json({ results: find(s.deals, "kundeportal_referanse", body.filterGroups[0].filters[0].value) });
    if (path === "/crm/v3/objects/contacts" && method === "POST") { const r = { id: id(), ...body.properties }; s.contacts.push(r); return json({ id: r.id }, 201); }
    if (path === "/crm/v3/objects/companies" && method === "POST") { const r = { id: id(), ...body.properties }; s.companies.push(r); return json({ id: r.id }, 201); }
    if (path === "/crm/v3/objects/deals" && method === "POST") { const r = { id: id(), ...body.properties }; s.deals.push(r); return json({ id: r.id }, 201); }
    if (path === "/crm/v3/objects/tasks" && method === "POST") { const r = { id: id(), properties: body.properties, associations: body.associations }; s.tasks.push(r); return json({ id: r.id }, 201); }
    if (path.includes("/associations/default/")) { s.assoc.push(path.replace("/crm/v4/objects/", "")); return json({}, 200); }
    if (method === "DELETE" && path.startsWith("/crm/v3/objects/deals/")) { s.deleted.push(path.split("/").pop()!); return json(null, 204); }
    if (path === "/crm/v3/objects/contacts/gdpr-delete") { s.gdpr.push(body); return json(null, 204); }
    if (path === "/crm/v3/pipelines/deals" && method === "GET") return json({ results: s.pipelines });
    if (path === "/crm/v3/pipelines/deals" && method === "POST") {
      const p = { id: "pipe1", label: body.label, stages: body.stages.map((st: { label: string; displayOrder: number }, i: number) => ({ id: `stage${i}`, label: st.label, displayOrder: st.displayOrder })) };
      s.pipelines.push(p); return json(p, 201);
    }
    if (path === "/crm/v3/properties/deals" && method === "GET") return json({ results: s.props });
    if (path === "/crm/v3/properties/deals" && method === "POST") { s.props.push({ name: body.name }); return json({}, 201); }
    return json({ message: "ukjent" }, 404);
  };
  vi.stubGlobal("fetch", vi.fn(handler));
  return s;
}

function enableHubspot(owner = true) {
  vi.stubEnv("HUBSPOT_ACCESS_TOKEN", "pat-test-token");
  vi.stubEnv("HUBSPOT_PIPELINE_ID", "pipe1");
  vi.stubEnv("HUBSPOT_STAGE_NEW", "stage0");
  vi.stubEnv("HUBSPOT_OWNER_ID", owner ? "555" : "");
}

let n = 0;
async function submit(name: string, over: Parameters<typeof validInput>[0] = {}) {
  const { customer, token, versionId } = await makePublished(name);
  const r = await submitInquiry({ token, versionId, idempotencyKey: `hs-key-${String(++n).padStart(12, "0")}`, input: validInput(over) });
  if (!r.ok) throw new Error("innsending feilet");
  return { customer, token, versionId, r };
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("HubSpot: av som standard", () => {
  it("uten konfigurasjon lages ingen overføringsrad, teamvarsel sendes og ingen kall gjøres", async () => {
    const hs = fakeHubspot();
    const { r } = await submit("Uten HubSpot AS");
    expect(await db.crmSync.count({ where: { inquiryId: r.inquiryId } })).toBe(0);
    const jobs = await db.emailJob.findMany({ where: { inquiryId: r.inquiryId } });
    expect(jobs.map((j) => j.type).sort()).toEqual(["customer_receipt", "team_notification"]);
    await processCrmSync(r.inquiryId);
    expect(hs.calls).toEqual([]);
  });
});

describe("HubSpot: overføring", () => {
  it("oppretter kontakt, selskap, deal i egen pipeline og oppgave når ingenting finnes", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    const { customer, r } = await submit("Ny Kunde AS", { contactName: "Kari Nordmann", contactEmail: "Kari@Example.com", contactPhone: "99999999" });
    // Teamvarsel utgår (HubSpot varsler), kvitteringen består.
    expect((await db.emailJob.findMany({ where: { inquiryId: r.inquiryId } })).map((j) => j.type)).toEqual(["customer_receipt"]);

    await processCrmSync(r.inquiryId);
    const row = await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } });
    expect(row).toMatchObject({ status: "synced", attempts: 1, errorCategory: null });
    expect(hs.contacts).toHaveLength(1);
    expect(hs.contacts[0]).toMatchObject({ email: "kari@example.com", firstname: "Kari", lastname: "Nordmann", phone: "99999999" });
    expect(hs.companies.map((c) => c.name)).toEqual(["Ny Kunde AS"]);
    expect(hs.deals).toHaveLength(1);
    const deal = hs.deals[0];
    expect(deal).toMatchObject({ pipeline: "pipe1", dealstage: "stage0", hubspot_owner_id: "555", kundeportal_referanse: r.reference, amount: "6000" });
    expect(deal.dealname).toContain("Ny Kunde AS");
    expect(deal.kundeportal_lenke).toBe(`http://localhost:3000/admin/foresporsler/${r.inquiryId}`);
    // Kontaktopplysninger ligger bare på kontakten, ikke i dealbeskrivelsen.
    expect(deal.description).not.toContain("kari@example.com");
    expect(deal.description).not.toContain("99999999");
    expect(deal.description).not.toContain("Kari");
    expect(hs.assoc).toEqual(expect.arrayContaining([
      `contacts/${row.contactId}/associations/default/companies/${row.companyId}`,
      `deals/${row.dealId}/associations/default/contacts/${row.contactId}`,
      `deals/${row.dealId}/associations/default/companies/${row.companyId}`,
    ]));
    expect(hs.tasks).toHaveLength(1);
    expect(hs.tasks[0].properties).toMatchObject({ hubspot_owner_id: "555", hs_task_priority: "HIGH" });
    expect(row.taskId).toBe(hs.tasks[0].id);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).hubspotCompanyId).toBe(row.companyId);
  });

  it("bruker eksisterende kontakt og selskap uten å endre dem eller opprette duplikater", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    hs.contacts.push({ id: "c1", email: "test@example.com", firstname: "Eksisterende" });
    hs.companies.push({ id: "co1", name: "Kjent AS" }, { id: "co2", name: "Kjent AS" });
    const { r } = await submit("Kjent AS");
    await processCrmSync(r.inquiryId);
    expect(hs.contacts).toHaveLength(1);
    expect(hs.contacts[0].firstname).toBe("Eksisterende");
    expect(hs.companies).toHaveLength(2);
    const row = await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } });
    expect(row).toMatchObject({ status: "synced", contactId: "c1", companyId: "co1" });
    expect(hs.calls.filter((c) => c === "POST /crm/v3/objects/contacts" || c === "POST /crm/v3/objects/companies")).toEqual([]);
  });

  it("gjenbruker bufret selskaps-ID for neste forespørsel fra samme kunde", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    const { token, versionId, r } = await submit("Bufret AS");
    await processCrmSync(r.inquiryId);
    const second = await submitInquiry({ token, versionId, idempotencyKey: "hs-key-bufret-0000002", input: validInput({ contactEmail: "annen@example.com" }) });
    if (!second.ok) throw new Error();
    hs.calls.length = 0;
    await processCrmSync(second.inquiryId);
    expect(hs.calls.some((c) => c.includes("companies/search"))).toBe(false);
    expect(hs.contacts).toHaveLength(2);
    expect(hs.companies).toHaveLength(1);
  });

  it("fra-pris gir ikke dealbeløp, og uten eier lages ingen oppgave og teamvarsel beholdes", async () => {
    enableHubspot(false);
    const hs = fakeHubspot();
    const { r } = await submit("Fra Pris AS", { packageId: "other", dateUnknown: true, eventDate: "", locationUnknown: true, location: "" });
    expect((await db.emailJob.findMany({ where: { inquiryId: r.inquiryId } })).map((j) => j.type).sort()).toEqual(["customer_receipt", "team_notification"]);
    await processCrmSync(r.inquiryId);
    expect(hs.deals[0].amount).toBeUndefined();
    expect(hs.deals[0].hubspot_owner_id).toBeUndefined();
    expect(hs.tasks).toHaveLength(0);
  });

  it("kjører ikke to ganger og lager ingen duplikater ved gjentatt kall", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    const { r } = await submit("Idempotent AS");
    await Promise.all([processCrmSync(r.inquiryId), processCrmSync(r.inquiryId)]);
    await processCrmSync(r.inquiryId);
    expect(hs.deals).toHaveLength(1);
    expect(hs.contacts).toHaveLength(1);
    expect(hs.tasks).toHaveLength(1);
    expect((await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } })).attempts).toBe(1);
  });

  it("finner eksisterende deal på referansen i stedet for å opprette en ny (tapt ID etter krasj)", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    const { r } = await submit("Krasj AS");
    const inq = await db.inquiry.findUniqueOrThrow({ where: { id: r.inquiryId } });
    hs.deals.push({ id: "d-existing", kundeportal_referanse: inq.reference });
    await processCrmSync(r.inquiryId);
    expect(hs.deals).toHaveLength(1);
    expect((await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } })).dealId).toBe("d-existing");
  });

  it("feil midt i lagres uten personopplysninger, og nytt forsøk fortsetter der det stoppet", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    hs.fail = (m, p) => (m === "POST" && p === "/crm/v3/objects/deals" ? 500 : null);
    const { r } = await submit("Feil AS", { contactEmail: "hemmelig.person@example.com" });
    await processCrmSync(r.inquiryId); // kaster aldri
    let row = await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } });
    expect(row).toMatchObject({ status: "failed", attempts: 1, errorCategory: "http_500" });
    expect(row.contactId).not.toBeNull();
    expect(row.dealId).toBeNull();
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join(" ");
    expect(logged).not.toContain("hemmelig.person@example.com");
    expect(logged).not.toContain("pat-test-token");
    expect(logged).not.toContain("secret");

    hs.fail = null;
    await processCrmSync(r.inquiryId);
    row = await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } });
    expect(row).toMatchObject({ status: "synced", attempts: 2, errorCategory: null });
    expect(hs.contacts).toHaveLength(1);
    expect(hs.deals).toHaveLength(1);
  });

  it("nettverksfeil og tidsavbrudd får egne feilkategorier", async () => {
    enableHubspot();
    fakeHubspot();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))));
    const { r } = await submit("Nett AS");
    await processCrmSync(r.inquiryId);
    expect((await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } })).errorCategory).toBe("network_error");
  });
});

describe("HubSpot: sveip", () => {
  it("prøver feilede på nytt, men gir opp etter fem forsøk", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    hs.fail = () => 503;
    const a = await submit("Sveip A AS");
    const b = await submit("Sveip B AS");
    await db.crmSync.update({ where: { inquiryId: b.r.inquiryId }, data: { status: "failed", attempts: 5 } });
    await processCrmSync(a.r.inquiryId);
    hs.fail = null;
    // Testene deler database: la bare de to radene her være aktuelle for sveipet.
    await db.crmSync.updateMany({ where: { inquiryId: { notIn: [a.r.inquiryId, b.r.inquiryId] } }, data: { status: "synced" } });
    expect(await retryOutstandingCrmSyncs()).toBe(1);
    expect((await db.crmSync.findUniqueOrThrow({ where: { inquiryId: a.r.inquiryId } })).status).toBe("synced");
    expect((await db.crmSync.findUniqueOrThrow({ where: { inquiryId: b.r.inquiryId } })).status).toBe("failed");
  });

  it("tar over en forlatt «syncing»-overføring, men ikke en som nettopp startet", async () => {
    enableHubspot();
    fakeHubspot();
    const { r } = await submit("Forlatt AS");
    await db.crmSync.update({ where: { inquiryId: r.inquiryId }, data: { status: "syncing", lastAttemptAt: new Date() } });
    await processCrmSync(r.inquiryId);
    expect((await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } })).status).toBe("syncing");
    await db.crmSync.update({ where: { inquiryId: r.inquiryId }, data: { lastAttemptAt: new Date(Date.now() - 5 * 60_000) } });
    await processCrmSync(r.inquiryId);
    expect((await db.crmSync.findUniqueOrThrow({ where: { inquiryId: r.inquiryId } })).status).toBe("synced");
  });
});

describe("HubSpot: sletting på e-postadresse", () => {
  it("arkiverer dealer før forespørslene slettes, og sletter kontakten bare på forespørsel", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    const { r } = await submit("Slett AS", { contactEmail: "slett@example.com" });
    await processCrmSync(r.inquiryId);
    const dealId = hs.deals[0].id;

    const res = await deleteInquiriesByEmail("SLETT@example.com");
    expect(res).toEqual({ count: 1, archivedDeals: 1, contactDeleted: false });
    expect(hs.deleted).toEqual([dealId]);
    expect(hs.gdpr).toEqual([]);
    expect(await db.inquiry.count({ where: { id: r.inquiryId } })).toBe(0);
    expect(await db.crmSync.count({ where: { inquiryId: r.inquiryId } })).toBe(0);

    const r2 = await submit("Slett To AS", { contactEmail: "slett2@example.com" });
    await processCrmSync(r2.r.inquiryId);
    const res2 = await deleteInquiriesByEmail("slett2@example.com", { deleteContact: true });
    expect(res2.contactDeleted).toBe(true);
    expect(hs.gdpr).toEqual([{ objectId: "slett2@example.com", idProperty: "email" }]);
  });

  it("avbryter uten å slette noe når HubSpot feiler", async () => {
    enableHubspot();
    const hs = fakeHubspot();
    const { r } = await submit("Avbryt AS", { contactEmail: "avbryt@example.com" });
    await processCrmSync(r.inquiryId);
    hs.fail = (m) => (m === "DELETE" ? 500 : null);
    await expect(deleteInquiriesByEmail("avbryt@example.com")).rejects.toThrow();
    expect(await db.inquiry.count({ where: { id: r.inquiryId } })).toBe(1);
  });

  it("uten HubSpot-data rører sletting ikke HubSpot", async () => {
    const hs = fakeHubspot();
    await submit("Ingen HS AS", { contactEmail: "ingen@example.com" });
    expect((await deleteInquiriesByEmail("ingen@example.com")).count).toBe(1);
    expect(hs.calls).toEqual([]);
  });
});

describe("HubSpot: oppsett og lenker", () => {
  it("oppretter pipeline og egenskaper, og er idempotent", async () => {
    vi.stubEnv("HUBSPOT_ACCESS_TOKEN", "pat-test-token");
    const hs = fakeHubspot();
    const first = await ensureHubspotSetup();
    expect(first).toMatchObject({ pipelineId: "pipe1", stageNewId: "stage0" });
    expect(first.created).toHaveLength(1 + PROPERTIES.length);
    expect(hs.pipelines[0].stages.map((st) => st.label)).toEqual(["Ny forespørsel", "Avklarer", "Tilbud sendt", "Booket", "Tapt"]);
    const second = await ensureHubspotSetup();
    expect(second.created).toEqual([]);
    expect(second).toMatchObject({ pipelineId: "pipe1", stageNewId: "stage0" });
    expect(hs.pipelines).toHaveLength(1);
    expect(hs.props).toHaveLength(PROPERTIES.length);
  });

  it("lenke til deal krever portal-ID og bruker EU-domenet som standard", () => {
    expect(hubspotDealUrl("42")).toBeNull();
    vi.stubEnv("HUBSPOT_PORTAL_ID", "3060835");
    expect(hubspotDealUrl("42")).toBe("https://app-eu1.hubspot.com/contacts/3060835/record/0-3/42");
  });
});
