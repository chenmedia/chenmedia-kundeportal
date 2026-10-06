import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { REDACTED, runRetention } from "@/server/retention";
import { deleteInquiriesByEmail, submitInquiry } from "@/server/inquiries";
import { GET as retentionCron } from "@/app/api/cron/retention/route";
import { makePublished, validInput } from "./helpers";

afterEach(() => { vi.unstubAllEnvs(); });

const DAY = 86_400_000;
let n = 0;

async function inquiry(over: { status?: string; ageDays?: number; email?: string } = {}) {
  const { token, versionId } = await makePublished(`Oppbevaring ${++n}`);
  const email = over.email ?? `person${n}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const r = await submitInquiry({ token, versionId, idempotencyKey: `ret-key-${n}-${Math.random().toString(36).slice(2, 10)}`, input: validInput({ contactEmail: email }) });
  if (!r.ok) throw new Error("innsending feilet");
  const inq = await db.inquiry.findFirstOrThrow({ where: { reference: r.reference }, include: { emailJobs: true } });
  if (over.status || over.ageDays) {
    await db.inquiry.update({ where: { id: inq.id }, data: { ...(over.status ? { status: over.status } : {}), ...(over.ageDays ? { updatedAt: new Date(Date.now() - over.ageDays * DAY) } : {}) } });
  }
  return { ...inq, email };
}
const exists = async (id: string) => (await db.inquiry.count({ where: { id } })) === 1;

describe("oppbevaring", () => {
  it("gjør ingenting når fristene ikke er satt", async () => {
    const old = await inquiry({ status: "closed", ageDays: 4000 });
    expect(await runRetention()).toEqual({ inquiriesDeleted: 0, emailsRedacted: 0 });
    expect(await exists(old.id)).toBe(true);
  });

  it("sletter bare avsluttede forespørsler som er eldre enn fristen", async () => {
    vi.stubEnv("INQUIRY_RETENTION_MONTHS", "12");
    const oldClosed = await inquiry({ status: "closed", ageDays: 400 });
    const recentClosed = await inquiry({ status: "closed", ageDays: 200 });
    const oldOpen = await inquiry({ status: "following_up", ageDays: 400 });
    const oldNew = await inquiry({ ageDays: 400 });
    const r = await runRetention();
    expect(r.inquiriesDeleted).toBeGreaterThanOrEqual(1);
    expect(await exists(oldClosed.id)).toBe(false);
    expect(await db.emailJob.count({ where: { inquiryId: oldClosed.id } })).toBe(0); // cascade
    expect(await exists(recentClosed.id)).toBe(true);
    expect(await exists(oldOpen.id)).toBe(true);
    expect(await exists(oldNew.id)).toBe(true);
  });

  it("ignorerer ugyldige verdier", async () => {
    for (const v of ["0", "-3", "abc", "1.5", "9999"]) {
      vi.stubEnv("INQUIRY_RETENTION_MONTHS", v);
      const old = await inquiry({ status: "closed", ageDays: 4000 });
      await runRetention();
      expect(await exists(old.id)).toBe(true);
    }
  });

  it("tømmer innholdet i gamle, sendte e-poster, men ikke i nye eller usendte", async () => {
    vi.stubEnv("EMAIL_BODY_RETENTION_DAYS", "30");
    const inq = await inquiry();
    const [team, receipt] = [inq.emailJobs.find((j) => j.type === "team_notification")!, inq.emailJobs.find((j) => j.type === "customer_receipt")!];
    await db.emailJob.update({ where: { id: team.id }, data: { status: "sent", lastAttemptAt: new Date(Date.now() - 40 * DAY) } });
    await db.emailJob.update({ where: { id: receipt.id }, data: { status: "sent", lastAttemptAt: new Date(Date.now() - 10 * DAY) } });
    const unsent = await inquiry();
    await db.emailJob.updateMany({ where: { inquiryId: unsent.id }, data: { lastAttemptAt: new Date(Date.now() - 40 * DAY) } });

    await runRetention();
    const t = await db.emailJob.findUniqueOrThrow({ where: { id: team.id } });
    expect(t).toMatchObject({ body: REDACTED, replyTo: null, recipient: "team@example.com" });
    const r = await db.emailJob.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(r.body).not.toBe(REDACTED); // sendt for under 30 dager siden
    for (const j of await db.emailJob.findMany({ where: { inquiryId: unsent.id } })) expect(j.body).not.toBe(REDACTED); // ikke sendt

    await db.emailJob.update({ where: { id: receipt.id }, data: { lastAttemptAt: new Date(Date.now() - 31 * DAY) } });
    await runRetention();
    expect(await db.emailJob.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ body: REDACTED, recipient: "(slettet)" });
  });
});

describe("sletting per e-postadresse", () => {
  it("sletter alle forespørsler fra adressen (uavhengig av store/små bokstaver), men ingen andre", async () => {
    const email = `Slett.Meg-${Math.random().toString(36).slice(2, 7)}@Example.com`;
    const a = await inquiry({ email });
    const b = await inquiry({ email: email.toUpperCase() });
    const other = await inquiry();
    expect(await deleteInquiriesByEmail(`  ${email.toLowerCase()} `)).toMatchObject({ count: 2 });
    expect(await exists(a.id)).toBe(false);
    expect(await exists(b.id)).toBe(false);
    expect(await db.emailJob.count({ where: { inquiryId: { in: [a.id, b.id] } } })).toBe(0);
    expect(await exists(other.id)).toBe(true);
    expect(await deleteInquiriesByEmail(email)).toMatchObject({ count: 0 });
  });
});

describe("cron: oppbevaring", () => {
  const call = (auth?: string) => retentionCron(new Request("http://localhost:3000/api/cron/retention", { headers: auth ? { authorization: auth } : {} }));

  it("krever CRON_SECRET", async () => {
    expect((await call()).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "en-lang-nok-hemmelighet-123");
    expect((await call("Bearer feil")).status).toBe(401);
    const ok = await call("Bearer en-lang-nok-hemmelighet-123");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, inquiriesDeleted: 0, emailsRedacted: 0 });
  });
});

describe("indekser", () => {
  it("migrasjonen har opprettet indeksene på fremmednøkler og sorteringskolonner", async () => {
    const rows = await db.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const names = new Set(rows.map((r) => r.indexname));
    for (const i of ["Inquiry_customerId_idx", "Inquiry_status_createdAt_idx", "EmailJob_inquiryId_idx", "MediaAsset_customerId_idx", "AdminSession_expiresAt_idx", "RateLimit_windowStart_idx"]) {
      expect(names.has(i), i).toBe(true);
    }
  });
});
