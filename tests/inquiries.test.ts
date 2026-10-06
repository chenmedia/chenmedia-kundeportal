import { describe, expect, it, vi, afterEach } from "vitest";
import { db } from "@/server/db";
import { publish, resolvePublished, saveDraft } from "@/server/customers";
import { submitInquiry } from "@/server/inquiries";
import { parseContent } from "@/lib/content";
import { todayInOslo } from "@/lib/format";
import { inquiryInputSchema, InquirySnapshot } from "@/lib/inquiry";
import { makePublished, validInput } from "./helpers";
import { processJob } from "@/server/email";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("forespørsel og prisøyeblikksbilde", () => {
  it("lagrer forespørsel med pris fra publisert innhold, og to e-postjobber", async () => {
    const { customer, token, versionId } = await makePublished("Snapshot AS");
    const r = await submitInquiry({ token, versionId, idempotencyKey: "snap-key-0000000001", input: validInput() });
    expect(r.ok).toBe(true);
    const inq = await db.inquiry.findFirstOrThrow({ where: { customerId: customer.id }, include: { emailJobs: true } });
    const snap = JSON.parse(inq.snapshot) as InquirySnapshot;
    expect(snap.customerName).toBe("Snapshot AS");
    expect(snap.package!.priceOre).toBe(600000);
    expect(snap.package!.coverage).toBe("Inntil 2 timer fotografering");
    expect(inq.emailJobs.map((j) => j.type).sort()).toEqual(["customer_receipt", "team_notification"]);
    const team = inq.emailJobs.find((j) => j.type === "team_notification")!;
    expect(team.replyTo).toBe("test@example.com"); // kundens adresse er Reply-To
    expect(team.recipient).toBe("team@example.com");
    // uten leverandør: bare lokal forhåndsvisning
    expect(inq.emailJobs.every((j) => j.status === "local_preview")).toBe(true);
  });

  it("gammel forespørsel beholder gammel pris etter ny publisering", async () => {
    const { customer, token, versionId } = await makePublished("Historisk AS");
    await submitInquiry({ token, versionId, idempotencyKey: "hist-key-0000000001", input: validInput() });
    const draft = parseContent((await db.customerDraft.findUniqueOrThrow({ where: { customerId: customer.id } })).content);
    draft.packages[0].priceOre = 999900;
    await saveDraft(customer.id, "Historisk AS", draft);
    await publish(customer.id);
    const inq = await db.inquiry.findFirstOrThrow({ where: { customerId: customer.id } });
    expect((JSON.parse(inq.snapshot) as InquirySnapshot).package!.priceOre).toBe(600000);
    expect(inq.versionId).toBe(versionId);
  });

  it("foreldet side gir STALE_VERSION og lagrer ingenting", async () => {
    const { customer, token, versionId } = await makePublished("Foreldet AS");
    await publish(customer.id); // ny versjon
    const r = await submitInquiry({ token, versionId, idempotencyKey: "stale-key-000000001", input: validInput() });
    expect(r).toMatchObject({ ok: false, code: "STALE_VERSION" });
    expect(await db.inquiry.count({ where: { customerId: customer.id } })).toBe(0);
    // med ny versjon går det gjennom
    const cur = (await resolvePublished(token))!.version.id;
    expect((await submitInquiry({ token, versionId: cur, idempotencyKey: "stale-key-000000001", input: validInput() })).ok).toBe(true);
  });

  it("ukjent pakke-ID avvises, «other» fungerer, og deaktivert kunde avvises", async () => {
    const { token, versionId } = await makePublished("Pakke AS");
    expect(await submitInquiry({ token, versionId, idempotencyKey: "pkg-key-00000000001", input: validInput({ packageId: "pkg_finnes_ikke" }) }))
      .toMatchObject({ ok: false, code: "PACKAGE_GONE" });
    const o = await submitInquiry({ token, versionId, idempotencyKey: "pkg-key-00000000002", input: validInput({ packageId: "other", dateUnknown: true, eventDate: "", locationUnknown: true, location: "" }) });
    expect(o.ok).toBe(true);
    const inq = await db.inquiry.findFirstOrThrow({ where: { idempotencyKey: "pkg-key-00000000002" } });
    expect(inq.dateUnknown).toBe(true);
    expect(inq.eventDate).toBeNull();
    expect(inq.locationUnknown).toBe(true);
    expect(inq.location).toBeNull();
    expect(await submitInquiry({ token: "ugyldig-ugyldig-ugyldig-ugyldig", versionId, idempotencyKey: "pkg-key-00000000003", input: validInput() }))
      .toMatchObject({ ok: false, code: "UNAVAILABLE" });
  });
});

describe("beskyttelse mot doble innsendinger", () => {
  it("samme nøkkel to ganger gir én forespørsel og samme referanse", async () => {
    const { customer, token, versionId } = await makePublished("Dobbel AS");
    const a = await submitInquiry({ token, versionId, idempotencyKey: "dbl-key-0000000001", input: validInput() });
    const b = await submitInquiry({ token, versionId, idempotencyKey: "dbl-key-0000000001", input: validInput() });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) { expect(b.reference).toBe(a.reference); expect(b.duplicate).toBe(true); }
    expect(await db.inquiry.count({ where: { customerId: customer.id } })).toBe(1);
    expect(await db.emailJob.count({ where: { inquiry: { customerId: customer.id } } })).toBe(2);
  });

  it("samtidige innsendinger med samme nøkkel gir fortsatt én forespørsel", async () => {
    const { customer, token, versionId } = await makePublished("Parallell AS");
    const rs = await Promise.all(Array.from({ length: 5 }, () => submitInquiry({ token, versionId, idempotencyKey: "par-key-0000000001", input: validInput() })));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(new Set(rs.map((r) => (r.ok ? r.reference : ""))).size).toBe(1);
    expect(await db.inquiry.count({ where: { customerId: customer.id } })).toBe(1);
  });

  it("nøkkel fra én kunde kan ikke gjenbrukes mot en annen", async () => {
    const a = await makePublished("Kunde X");
    const b = await makePublished("Kunde Y");
    await submitInquiry({ token: a.token, versionId: a.versionId, idempotencyKey: "xyz-key-0000000001", input: validInput() });
    const r = await submitInquiry({ token: b.token, versionId: b.versionId, idempotencyKey: "xyz-key-0000000001", input: validInput() });
    expect(r).toMatchObject({ ok: false, code: "UNAVAILABLE" });
  });
});

describe("validering", () => {
  it("dato i fortiden (Europe/Oslo) avvises, ukjent dato/sted godtas", () => {
    expect(inquiryInputSchema.safeParse(validInput({ eventDate: "2001-01-01" })).success).toBe(false);
    expect(inquiryInputSchema.safeParse(validInput({ eventDate: todayInOslo() })).success).toBe(true);
    expect(inquiryInputSchema.safeParse(validInput({ dateUnknown: true, eventDate: "", locationUnknown: true, location: "" })).success).toBe(true);
    expect(inquiryInputSchema.safeParse(validInput({ location: "" })).success).toBe(false);
  });
  it("todayInOslo bruker Oslo-tid rundt midnatt", () => {
    // 23:30 UTC 30. juni = 01:30 1. juli i Oslo (sommertid)
    expect(todayInOslo(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
  it("obligatoriske felt og lengdegrenser", () => {
    const bad = inquiryInputSchema.safeParse(validInput({ eventName: "A", description: "kort", contactEmail: "ikke-epost", contactName: "" }));
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["eventName", "description", "contactEmail", "contactName"]));
    expect(inquiryInputSchema.safeParse(validInput({ description: "x".repeat(3001) })).success).toBe(false);
  });
});

describe("e-postjobber", () => {
  it("feil lagres på jobben, forespørselen består, og ny utsending fungerer", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Chen Media <noreply@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { customer, token, versionId } = await makePublished("Epost AS");
    const r = await submitInquiry({ token, versionId, idempotencyKey: "mail-key-000000001", input: validInput() });
    expect(r.ok).toBe(true);
    let jobs = await db.emailJob.findMany({ where: { inquiry: { customerId: customer.id } } });
    expect(await db.inquiry.count({ where: { customerId: customer.id } })).toBe(1);
    expect(jobs.every((j) => j.status === "failed" && j.attempts === 1 && j.errorCategory === "http_500")).toBe(true);

    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    for (const j of jobs) await processJob(j.id);
    jobs = await db.emailJob.findMany({ where: { inquiry: { customerId: customer.id } } });
    expect(jobs.every((j) => j.status === "sent" && j.attempts === 2)).toBe(true);
    expect(await db.inquiry.count({ where: { customerId: customer.id } })).toBe(1); // ingen ny forespørsel
    // Reply-To og avsender
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);
    expect(body.from).toContain("noreply@example.com");
  });
});
