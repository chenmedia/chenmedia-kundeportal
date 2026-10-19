import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { allow } from "@/server/rate-limit";
import { processJob, retryOutstandingJobs } from "@/server/email";
import { cronAuthorized } from "@/server/cron";
import { submitInquiry } from "@/server/inquiries";
import { logError } from "@/server/log";
import { isEmail, mailtoHref } from "@/lib/content";
import { decryptText, encryptText } from "@/server/crypto";
import { appUrl } from "@/server/app-url";
import { POST as inquiryRoute } from "@/app/api/k/[token]/inquiry/route";
import { makePublished, validInput } from "./helpers";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function stubEmail(fetchImpl: (...a: unknown[]) => Promise<Response>) {
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Chen Media <noreply@example.com>");
  const m = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", m);
  return m;
}

/** Lager en forespørsel uten å sende (e-post av under innsendingen), og setter jobben til «pending» eller gitt tilstand. */
async function makeJob(over: Record<string, unknown> = {}) {
  const { customer, token, versionId } = await makePublished(`Jobb ${Math.random().toString(36).slice(2, 8)}`);
  const provider = process.env.EMAIL_PROVIDER;
  process.env.EMAIL_PROVIDER = "";
  try {
    await submitInquiry({ token, versionId, idempotencyKey: `job-key-${Math.random().toString(36).slice(2, 12)}-xx`, input: validInput({ contactEmail: `m${Math.random().toString(36).slice(2, 8)}@example.com` }) });
  } finally {
    process.env.EMAIL_PROVIDER = provider;
  }
  const jobs = await db.emailJob.findMany({ where: { inquiry: { customerId: customer.id } } });
  // Bare teamvarselet er med i testene; mottakerkvitteringen settes som sendt så den ikke forstyrrer tellingene.
  await db.emailJob.updateMany({ where: { id: { in: jobs.filter((j) => j.type !== "team_notification").map((j) => j.id) } }, data: { status: "sent" } });
  const job = jobs.find((j) => j.type === "team_notification")!;
  await db.emailJob.update({ where: { id: job.id }, data: { status: "pending", ...over } });
  return { customer, token, versionId, jobId: job.id };
}

describe("rate-limit", () => {
  it("er atomisk: samtidige forsøk slipper aldri gjennom flere enn grensen", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => allow("samtidig-test", 5, 60)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("starter nytt vindu når det gamle er utløpt", async () => {
    for (let i = 0; i < 3; i++) await allow("vindu-test", 2, 60);
    expect(await allow("vindu-test", 2, 60)).toBe(false);
    await db.rateLimit.updateMany({ data: { windowStart: new Date(Date.now() - 61_000) } });
    expect(await allow("vindu-test", 2, 60)).toBe(true);
  });
});

describe("innsendingsrute", () => {
  function req(token: string) {
    return inquiryRoute(
      new Request(`http://localhost:3000/api/k/${token}/inquiry`, {
        method: "POST",
        headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ idempotencyKey: "route-key-0000000001", versionId: "x", website: "" }),
      }),
      { params: Promise.resolve({ token }) },
    );
  }

  it("ukjent lenke gir 404 og skriver ingen rate-limit-rader", async () => {
    const before = await db.rateLimit.count();
    for (let i = 0; i < 12; i++) {
      const res = await req(`ukjent-token-${i}-abcdefghijklmnopqrstuvwxyz`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ ok: false, error: "unavailable" });
    }
    expect(await db.rateLimit.count()).toBe(before);
  });
});

describe("kvittering til kunden", () => {
  it("sender maks tre kvitteringer per mottaker i døgnet, men varsler teamet hver gang", async () => {
    const { customer, token, versionId } = await makePublished("Kvittering AS");
    const email = `kvittering-${Math.random().toString(36).slice(2, 8)}@example.com`;
    for (let n = 0; n < 4; n++) {
      const r = await submitInquiry({ token, versionId, idempotencyKey: `kv-key-${n}-000000000000`, input: validInput({ contactEmail: email }) });
      expect(r.ok).toBe(true);
    }
    const jobs = await db.emailJob.findMany({ where: { inquiry: { customerId: customer.id } } });
    expect(jobs.filter((j) => j.type === "team_notification")).toHaveLength(4);
    expect(jobs.filter((j) => j.type === "customer_receipt")).toHaveLength(3);
  });
});

describe("e-postutsending", () => {
  it("sender med idempotensnøkkel og tidsavbrudd", async () => {
    const m = stubEmail(async () => new Response("{}", { status: 200 }));
    const { jobId } = await makeJob();
    await processJob(jobId);
    const init = m.mock.calls.at(-1)![1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(`emailjob-${jobId}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("registrerer tidsavbrudd som egen feilkategori", async () => {
    stubEmail(async () => { throw new DOMException("timeout", "TimeoutError"); });
    const { jobId } = await makeJob();
    await processJob(jobId);
    const j = await db.emailJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(j).toMatchObject({ status: "failed", errorCategory: "timeout", attempts: 1 });
  });

  it("sender bare én gang når to utsendinger overlapper", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const m = stubEmail(async () => { await gate; return new Response("{}", { status: 200 }); });
    const { jobId } = await makeJob();
    const a = processJob(jobId);
    const b = processJob(jobId);
    await new Promise((r) => setTimeout(r, 150));
    release();
    await Promise.all([a, b]);
    expect(m).toHaveBeenCalledTimes(1);
    expect((await db.emailJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("sent");
  });

  it("tar over en forlatt «sending», men ikke en som nettopp startet", async () => {
    const m = stubEmail(async () => new Response("{}", { status: 200 }));
    const fresh = await makeJob({ status: "sending", lastAttemptAt: new Date() });
    await processJob(fresh.jobId);
    expect(m).not.toHaveBeenCalled();
    const stale = await makeJob({ status: "sending", lastAttemptAt: new Date(Date.now() - 5 * 60_000) });
    await processJob(stale.jobId);
    expect(m).toHaveBeenCalledTimes(1);
    expect((await db.emailJob.findUniqueOrThrow({ where: { id: stale.jobId } })).status).toBe("sent");
  });
});

describe("daglig sveip", () => {
  it("prøver feilede jobber på nytt, men ikke de som er utprøvd eller for gamle", async () => {
    await db.emailJob.deleteMany({});
    stubEmail(async () => new Response("{}", { status: 200 }));
    const ok = await makeJob({ status: "failed", attempts: 1 });
    const exhausted = await makeJob({ status: "failed", attempts: 5 });
    const old = await makeJob({ status: "failed", attempts: 1, createdAt: new Date(Date.now() - 4 * 86400_000) });
    expect(await retryOutstandingJobs()).toBe(1);
    const status = async (id: string) => (await db.emailJob.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(ok.jobId)).toBe("sent");
    expect(await status(exhausted.jobId)).toBe("failed");
    expect(await status(old.jobId)).toBe("failed");
  });

  it("gjør ingenting uten e-postleverandør", async () => {
    expect(await retryOutstandingJobs()).toBe(0);
  });
});

describe("cron-autorisasjon", () => {
  const h = (v?: string) => new Headers(v ? { authorization: v } : {});
  it("avviser alt uten CRON_SECRET, eller med for kort hemmelighet", () => {
    expect(cronAuthorized(h("Bearer "))).toBe(false);
    vi.stubEnv("CRON_SECRET", "kort");
    expect(cronAuthorized(h("Bearer kort"))).toBe(false);
  });
  it("godtar bare riktig hemmelighet", () => {
    vi.stubEnv("CRON_SECRET", "en-lang-nok-hemmelighet-123");
    expect(cronAuthorized(h("Bearer en-lang-nok-hemmelighet-123"))).toBe(true);
    expect(cronAuthorized(h("Bearer feil"))).toBe(false);
    expect(cronAuthorized(h())).toBe(false);
  });
});

describe("e-postadresser", () => {
  it.each(["kai@chenmedia.no", "fornavn.etternavn+tag@firma.co.uk", "o'brien@firma.no", "æøå@firma.no"])("godtar %s", (a) => expect(isEmail(a)).toBe(true));
  it.each(["a@b.no?bcc=x@y.no", "a@b.no&body=hei", "a@b.no,c@d.no", "a@b.no;c@d.no", "<a@b.no>", "a b@c.no", "a@b", "a@b.no\n", "a@b.no%0Abcc=x"])("avviser %s", (a) => expect(isEmail(a)).toBe(false));

  it("mailto-lenken kan aldri bære ekstra parametre", () => {
    expect(mailtoHref("kai@chenmedia.no")).toBe("mailto:kai@chenmedia.no");
    expect(mailtoHref("a@b.no?bcc=x@y.no&body=hei")).toBe("mailto:a@b.no%3Fbcc%3Dx@y.no%26body%3Dhei");
  });
});

describe("logging", () => {
  it("logger ikke meldinger fra Prisma/JSON/zod (kan inneholde innsendte data)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const prismaLike = Object.assign(new Error("Invalid `prisma.inquiry.create()` invocation: contactEmail: 'privat@example.com'"), { name: "PrismaClientKnownRequestError", code: "P2002", meta: { target: ["idempotencyKey"] } });
    logError("test", prismaLike, { inquiryId: "i1" });
    let line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ scope: "test", name: "PrismaClientKnownRequestError", code: "P2002", target: "idempotencyKey", inquiryId: "i1" });
    expect(JSON.stringify(line)).not.toContain("privat@example.com");
    logError("test", new SyntaxError(`Unexpected token 'x', "passord123" is not valid JSON`));
    line = JSON.parse(spy.mock.calls[1][0] as string);
    expect(line.message).toBeUndefined();
    expect(JSON.stringify(line)).not.toContain("passord123");
  });

  it("kontekst kan ikke overskrive level og scope", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("riktig", new Error("http_500"), { level: "info", scope: "feil" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", scope: "riktig", message: "http_500" });
  });
});

describe("konfigurasjon", () => {
  it("avviser eksempelhemmeligheten fra .env.example i produksjon", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_SECRET", "bytt-meg-lokal-utvikling-bytt-meg-lokal");
    expect(() => encryptText("x")).toThrow(/eksempelverdien/);
    vi.stubEnv("APP_SECRET", "en-helt-annen-hemmelighet-123456");
    expect(decryptText(encryptText("hei"))).toBe("hei");
  });

  it("bruker produksjonsadressen på Vercel når APP_URL mangler", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "booking.chenmedia.no");
    expect(appUrl()).toBe("https://booking.chenmedia.no");
    vi.stubEnv("APP_URL", "https://eksplisitt.example/");
    expect(appUrl()).toBe("https://eksplisitt.example");
  });
});
