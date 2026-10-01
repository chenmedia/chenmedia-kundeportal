import { describe, expect, it } from "vitest";
import { saveUpload } from "@/server/media";
import { makeCustomer, PNG_1X1 } from "./helpers";

describe("bildeopplasting", () => {
  it("godtar ekte PNG", async () => {
    const c = await makeCustomer("Bilde AS");
    const r = await saveUpload(c.id, PNG_1X1, "test.png");
    expect(r.ok).toBe(true);
  });
  it("avviser SVG, tekst forkledd som bilde og tom fil", async () => {
    const c = await makeCustomer("Bilde2 AS");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect((await saveUpload(c.id, svg, "x.svg")).ok).toBe(false);
    expect((await saveUpload(c.id, Buffer.from("<script>alert(1)</script>"), "x.png")).ok).toBe(false);
    expect((await saveUpload(c.id, Buffer.alloc(0), "x.png")).ok).toBe(false);
  });
  it("avviser filer over 10 MB", async () => {
    const c = await makeCustomer("Bilde3 AS");
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(10 * 1024 * 1024)]);
    const r = await saveUpload(c.id, big, "stor.png");
    expect(r.ok).toBe(false);
  });
});

describe("bildebehandling", () => {
  it("skalerer store bilder ned til maks 1600 px og lagrer som WebP", async () => {
    const sharp = (await import("sharp")).default;
    const big = await sharp({ create: { width: 3200, height: 2000, channels: 3, background: "#c25a2e" } }).jpeg().toBuffer();
    const c = await makeCustomer("Skalering AS");
    const r = await saveUpload(c.id, big, "stort.jpg");
    if (!r.ok) throw new Error(r.error);
    const { db } = await import("@/server/db");
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: r.id } });
    expect(asset.mimeType).toBe("image/webp");
    expect(asset.width).toBe(1600);
    expect(asset.height).toBe(1000);
    const { getStore } = await import("@/server/storage");
    const stored = await getStore().read(asset.storageKey);
    expect(stored!.length).toBeLessThan(big.length);
  });

  it("forstørrer ikke små bilder", async () => {
    const c = await makeCustomer("Liten AS");
    const r = await saveUpload(c.id, PNG_1X1, "liten.png");
    if (!r.ok) throw new Error(r.error);
    const { db } = await import("@/server/db");
    const a = await db.mediaAsset.findUniqueOrThrow({ where: { id: r.id } });
    expect([a.width, a.height]).toEqual([1, 1]);
  });

  it("fjerner EXIF-metadata (inkl. posisjon) fra det lagrede bildet", async () => {
    const sharp = (await import("sharp")).default;
    const withExif = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#111" } })
      .jpeg().withExif({ IFD0: { Copyright: "hemmelig-opphavsrett", ImageDescription: "hemmelig-beskrivelse" } }).toBuffer();
    expect(withExif.includes(Buffer.from("hemmelig-opphavsrett"))).toBe(true);
    const c = await makeCustomer("Exif AS");
    const r = await saveUpload(c.id, withExif, "exif.jpg");
    if (!r.ok) throw new Error(r.error);
    const { db } = await import("@/server/db");
    const a = await db.mediaAsset.findUniqueOrThrow({ where: { id: r.id } });
    const { getStore } = await import("@/server/storage");
    const stored = (await getStore().read(a.storageKey))!;
    expect(stored.includes(Buffer.from("hemmelig-opphavsrett"))).toBe(false);
    expect(stored.includes(Buffer.from("hemmelig-beskrivelse"))).toBe(false);
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("originalfilen slettes etter behandling", async () => {
    const fs = await import("node:fs/promises");
    const dir = process.env.STORAGE_DIR!;
    const before = (await fs.readdir(dir).catch(() => [])).length;
    const c = await makeCustomer("Rydd AS");
    const r = await saveUpload(c.id, PNG_1X1, "rydd.png");
    expect(r.ok).toBe(true);
    const after = (await fs.readdir(dir)).length;
    expect(after - before).toBe(1);
  });

  it("gyldig format i header men ødelagt innhold avvises og ryddes bort", async () => {
    const broken = Buffer.concat([PNG_1X1.subarray(0, 40), Buffer.from("ikke-bildedata".repeat(20))]);
    const c = await makeCustomer("Ødelagt AS");
    const r = await saveUpload(c.id, broken, "odelagt.png");
    expect(r.ok).toBe(false);
  });
});
