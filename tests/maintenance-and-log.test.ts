import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { createAdmin } from "@/server/admin-core";
import { login, purgeExpiredSessions } from "@/server/admin-auth";
import { allow, purgeStaleRateLimits } from "@/server/rate-limit";
import { logError } from "@/server/log";

afterEach(() => { vi.restoreAllMocks(); });

describe("opprydding", () => {
  it("fjerner utløpte admin-sesjoner, men ikke gyldige", async () => {
    const admin = await createAdmin("rydd@example.com", "et-langt-passord-123");
    await db.adminSession.createMany({
      data: [
        { tokenHash: "utlopt-1", adminId: admin.id, expiresAt: new Date(Date.now() - 60_000) },
        { tokenHash: "gyldig-1", adminId: admin.id, expiresAt: new Date(Date.now() + 3600_000) },
      ],
    });
    expect(await purgeExpiredSessions()).toBe(1);
    expect(await db.adminSession.count({ where: { tokenHash: "gyldig-1" } })).toBe(1);
  });

  it("innlogging rydder utløpte sesjoner", async () => {
    const admin = await createAdmin("rydd2@example.com", "et-langt-passord-123");
    await db.adminSession.create({ data: { tokenHash: "utlopt-2", adminId: admin.id, expiresAt: new Date(Date.now() - 1000) } });
    expect((await login("rydd2@example.com", "et-langt-passord-123", "ip-rydd")).ok).toBe(true);
    expect(await db.adminSession.count({ where: { tokenHash: "utlopt-2" } })).toBe(0);
  });

  it("sletter rate-limit-rader eldre enn 24 timer", async () => {
    await allow("rydd-gammel", 5, 60);
    await allow("rydd-ny", 5, 60);
    const rows = await db.rateLimit.findMany();
    await db.rateLimit.update({ where: { key: rows[0].key }, data: { windowStart: new Date(Date.now() - 25 * 3600_000) } });
    expect(await purgeStaleRateLimits()).toBe(1);
  });
});

describe("feillogging", () => {
  it("logger strukturert og trunkert uten å lekke ekstra data", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = Object.assign(new Error("x".repeat(1000)), { code: "P2002" });
    logError("test.scope", err, { customerId: "c1" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", scope: "test.scope", code: "P2002", customerId: "c1" });
    expect(line.message.length).toBe(300);
    expect(line.stack).toBeUndefined();
  });
});
