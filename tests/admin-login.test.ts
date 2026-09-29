import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { createAdmin } from "@/server/admin-core";
import { login, sessionFromToken } from "@/server/admin-auth";
import { supabaseAuthConfigured, verifyWithSupabase } from "@/server/supabase-auth";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function useSupabase() {
  vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
}
const okUser = (email: string) => Response.json({ access_token: "jwt", user: { email, email_confirmed_at: "2026-01-01T00:00:00Z" } });

describe("innlogging lokalt (passordhash)", () => {
  it("riktig passord gir sesjon, feil passord og ukjent bruker avvises", async () => {
    await createAdmin("Lokal@Example.com", "et-langt-passord-123");
    const ok = await login("lokal@example.com", "et-langt-passord-123", "ip-l1");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((await sessionFromToken(ok.token))?.email).toBe("lokal@example.com");
    expect((await login("lokal@example.com", "feil", "ip-l2")).ok).toBe(false);
    expect((await login("ukjent@example.com", "hva-som-helst-1234", "ip-l3")).ok).toBe(false);
  });
  it("begrenser antall forsøk", async () => {
    await createAdmin("rate@example.com", "et-langt-passord-123");
    let last: Awaited<ReturnType<typeof login>> | undefined;
    for (let i = 0; i < 9; i++) last = await login("rate@example.com", "feil", "ip-rate");
    expect(last).toMatchObject({ ok: false, error: "rate" });
  });
});

describe("innlogging via Supabase Auth", () => {
  it("krever både gyldig Supabase-passord og at e-posten står på godkjenningslisten", async () => {
    useSupabase();
    await createAdmin("kai@example.com"); // uten passordhash
    const f = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).includes("/logout")) return new Response(null, { status: 204 });
      const { email, password } = JSON.parse(init.body as string);
      return password === "riktig" ? okUser(email) : Response.json({ error: "invalid_grant" }, { status: 400 });
    });
    vi.stubGlobal("fetch", f);

    const ok = await login("Kai@example.com", "riktig", "ip-s1");
    expect(ok.ok).toBe(true);
    expect((await login("kai@example.com", "feil", "ip-s2")).ok).toBe(false);
    // Har Supabase-konto men står ikke på listen: ingen tilgang
    expect((await login("fremmed@example.com", "riktig", "ip-s3")).ok).toBe(false);
    // Nøkkelen sendes til Supabase, ikke service-nøkkel
    const call = f.mock.calls.find((c) => String(c[0]).includes("grant_type=password"))!;
    expect(call[1].headers.apikey).toBe("sb_publishable_x");
  });

  it("lokalt passord virker ikke når Supabase Auth er aktiv", async () => {
    await createAdmin("begge@example.com", "et-langt-passord-123");
    useSupabase();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 })));
    expect((await login("begge@example.com", "et-langt-passord-123", "ip-s4")).ok).toBe(false);
  });

  it("avviser ubekreftet e-post og avvik mellom e-poster", async () => {
    useSupabase();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "jwt", user: { email: "a@example.com", email_confirmed_at: null } })));
    expect((await verifyWithSupabase("a@example.com", "x")).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okUser("annen@example.com")));
    expect((await verifyWithSupabase("a@example.com", "x")).ok).toBe(false);
  });

  it("nettverksfeil mot Supabase gir avvisning, ikke krasj", async () => {
    useSupabase();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("nett")));
    expect((await verifyWithSupabase("a@example.com", "x")).ok).toBe(false);
  });

  it("er bare aktiv når URL og publisert nøkkel finnes", () => {
    expect(supabaseAuthConfigured({} as never)).toBe(false);
    expect(supabaseAuthConfigured({ SUPABASE_URL: "https://x" } as never)).toBe(false);
    expect(supabaseAuthConfigured({ SUPABASE_URL: "https://x", SUPABASE_ANON_KEY: "k" } as never)).toBe(true);
  });

  it("sletting av administrator fjerner aktive sesjoner", async () => {
    await createAdmin("bort@example.com", "et-langt-passord-123");
    const r = await login("bort@example.com", "et-langt-passord-123", "ip-s5");
    expect(r.ok).toBe(true);
    await db.adminUser.delete({ where: { email: "bort@example.com" } });
    if (r.ok) expect(await sessionFromToken(r.token)).toBeNull();
  });
});
