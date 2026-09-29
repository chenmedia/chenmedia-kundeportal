import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore } from "@/server/storage";

const KEY = "a".repeat(32);

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function useSupabase() {
  vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "bucket-x");
}

describe("lagringsadapter (Supabase, mocket)", () => {
  it("bruker lokal disk uten Supabase-oppsett, men feiler tydelig på Vercel", () => {
    expect(getStore().kind).toBe("local");
    vi.stubEnv("VERCEL", "1");
    expect(() => getStore()).toThrow(/Bildelagring/);
  });

  it("lager signert opplastings-URL med service-nøkkel på serversiden", async () => {
    useSupabase();
    const f = vi.fn().mockResolvedValue(Response.json({ url: `/object/upload/sign/bucket-x/${KEY}?token=t1` }));
    vi.stubGlobal("fetch", f);
    const t = await getStore().uploadTarget(KEY);
    expect(t.url).toBe(`https://proj.supabase.co/storage/v1/object/upload/sign/bucket-x/${KEY}?token=t1`);
    expect(f.mock.calls[0][0]).toBe(`https://proj.supabase.co/storage/v1/object/upload/sign/bucket-x/${KEY}`);
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer service-key");
  });

  it("leser bare starten av filen og total størrelse fra Content-Range", async () => {
    useSupabase();
    const f = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-range": "bytes 0-2/9000" } }));
    vi.stubGlobal("fetch", f);
    const r = await getStore().readRange(KEY, 3);
    expect(r).toMatchObject({ total: 9000 });
    expect(r!.bytes.length).toBe(3);
    expect(f.mock.calls[0][1].headers.Range).toBe("bytes=0-2");
  });

  it("server bilder via 60 sekunders signert URL uten å lekke service-nøkkelen", async () => {
    useSupabase();
    const f = vi.fn().mockResolvedValue(Response.json({ signedURL: `/object/sign/bucket-x/${KEY}?token=abc` }));
    vi.stubGlobal("fetch", f);
    const res = await getStore().serve(KEY, "image/png");
    expect(res!.status).toBe(302);
    const loc = res!.headers.get("location")!;
    expect(loc).toContain("token=abc");
    expect(loc).not.toContain("service-key");
    expect(res!.headers.get("cache-control")).toContain("no-store");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ expiresIn: 60 });
  });

  it("avviser nøkler som kan gå utenfor bucket", async () => {
    useSupabase();
    await expect(getStore().uploadTarget("../../etc/passwd")).rejects.toThrow();
    await expect(getStore().readRange("x/y", 10)).rejects.toThrow();
  });
});
