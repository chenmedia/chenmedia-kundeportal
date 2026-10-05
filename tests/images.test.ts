import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { assetsBelongToCustomer, duplicateCustomer, publish, saveDraft } from "@/server/customers";
import { MAX_GALLERY, contentImageIds, contentSchema, parseContent, remapImageIds } from "@/lib/content";
import { saveUpload } from "@/server/media";
import { GET as customerMedia } from "@/app/k/[token]/media/[assetId]/route";
import { makePublished, PNG_1X1 } from "./helpers";

async function upload(customerId: string, name: string) {
  const r = await saveUpload(customerId, PNG_1X1, name);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

const call = (token: string, assetId: string) =>
  customerMedia(new Request("http://x"), { params: Promise.resolve({ token, assetId }) });

describe("flere bilder i innholdet", () => {
  it("gamle versjoner uten galleri og pakkebilder leses fortsatt", () => {
    const old = contentSchema.parse({ packages: [{ id: "p1", name: "Lite", priceOre: 1000 }] });
    expect(old.gallery).toEqual([]);
    expect(old.packages[0].imageId).toBeNull();
    expect(contentImageIds(old)).toEqual([]);
  });

  it("galleriet har en øvre grense", () => {
    const item = (n: number) => ({ id: `g${n}`, imageId: `img${n}` });
    expect(() => contentSchema.parse({ gallery: Array.from({ length: MAX_GALLERY }, (_, n) => item(n)) })).not.toThrow();
    expect(() => contentSchema.parse({ gallery: Array.from({ length: MAX_GALLERY + 1 }, (_, n) => item(n)) })).toThrow();
  });

  it("contentImageIds samler hero, pakker og galleri uten duplikater", () => {
    const c = contentSchema.parse({
      heroImageId: "a",
      packages: [{ id: "p1", imageId: "b" }, { id: "p2", imageId: null }],
      gallery: [{ id: "g1", imageId: "a" }, { id: "g2", imageId: "c" }],
    });
    expect(contentImageIds(c).sort()).toEqual(["a", "b", "c"]);
  });

  it("remapImageIds bytter ID-er og fjerner ukjente galleribilder", () => {
    const c = contentSchema.parse({
      heroImageId: "a",
      packages: [{ id: "p1", imageId: "b" }],
      gallery: [{ id: "g1", imageId: "c" }, { id: "g2", imageId: "ukjent" }],
    });
    const m = new Map([["a", "A"], ["b", "B"], ["c", "C"]]);
    const r = remapImageIds(c, (id) => m.get(id));
    expect(r.heroImageId).toBe("A");
    expect(r.packages[0].imageId).toBe("B");
    expect(r.gallery.map((g) => g.imageId)).toEqual(["C"]);
  });

  it("assetsBelongToCustomer krever at alle bildene tilhører kunden", async () => {
    const a = await makePublished("Eier A");
    const b = await makePublished("Eier B");
    const mine = await upload(a.customer.id, "a.png");
    const theirs = await upload(b.customer.id, "b.png");
    expect(await assetsBelongToCustomer([], a.customer.id)).toBe(true);
    expect(await assetsBelongToCustomer([mine], a.customer.id)).toBe(true);
    expect(await assetsBelongToCustomer([mine, theirs], a.customer.id)).toBe(false);
    expect(await assetsBelongToCustomer(["finnes-ikke"], a.customer.id)).toBe(false);
  });

  it("kundelenken serverer galleri- og pakkebilder først når de er publisert, og aldri andres bilder", async () => {
    const a = await makePublished("Galleri A");
    const b = await makePublished("Galleri B");
    const gal = await upload(a.customer.id, "galleri.png");
    const pkg = await upload(a.customer.id, "pakke.png");
    const unused = await upload(a.customer.id, "ubrukt.png");
    const other = await upload(b.customer.id, "annen.png");

    const draft = parseContent((await db.customerDraft.findUniqueOrThrow({ where: { customerId: a.customer.id } })).content);
    draft.gallery = [{ id: "g1", imageId: gal, alt: "Fra en konferanse" }];
    draft.packages[0].imageId = pkg;
    await saveDraft(a.customer.id, "Galleri A", draft);

    // Ikke publisert ennå
    expect((await call(a.token, gal)).status).toBe(404);
    expect((await call(a.token, pkg)).status).toBe(404);

    await publish(a.customer.id);
    expect((await call(a.token, gal)).status).toBe(200);
    expect((await call(a.token, pkg)).status).toBe(200);
    expect((await call(a.token, unused)).status).toBe(404);
    expect((await call(a.token, other)).status).toBe(404);
    expect((await call(b.token, gal)).status).toBe(404);
  });

  it("duplisert kunde får egne kopier av alle bilder", async () => {
    const src = await makePublished("Kopi-kilde");
    const hero = await upload(src.customer.id, "hero.png");
    const gal = await upload(src.customer.id, "gal.png");
    const pkg = await upload(src.customer.id, "pkg.png");
    const draft = parseContent((await db.customerDraft.findUniqueOrThrow({ where: { customerId: src.customer.id } })).content);
    draft.heroImageId = hero;
    draft.gallery = [{ id: "g1", imageId: gal, alt: "" }];
    draft.packages[1].imageId = pkg;
    await saveDraft(src.customer.id, "Kopi-kilde", draft);

    const copy = await duplicateCustomer(src.customer.id);
    const copied = parseContent((await db.customerDraft.findUniqueOrThrow({ where: { customerId: copy.id } })).content);
    const ids = contentImageIds(copied);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(hero);
    expect(ids).not.toContain(gal);
    expect(ids).not.toContain(pkg);
    expect(await assetsBelongToCustomer(ids, copy.id)).toBe(true);
  });
});
