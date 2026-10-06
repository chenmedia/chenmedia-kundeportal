import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  duplicateCustomer, getRawToken, publish, resolvePublished, rotateToken, saveDraft, setActive, createCustomer,
} from "@/server/customers";
import { parseContent } from "@/lib/content";
import { draftOf, makeCustomer, makePublished, portalIdOf, PNG_1X1, validInput } from "./helpers";
import { submitInquiry } from "@/server/inquiries";
import { saveUpload } from "@/server/media";
import { GET as customerMedia } from "@/app/k/[token]/media/[assetId]/route";
import { sessionFromToken } from "@/server/admin-auth";

describe("tilgangskontroll for kundelenker", () => {
  it("ugyldig, upublisert og deaktivert lenke gir ingen data", async () => {
    expect(await resolvePublished("finnes-ikke-finnes-ikke-finnes-ikke")).toBeNull();
    const draftOnly = await makeCustomer("Kun utkast");
    expect(await resolvePublished((await getRawToken(draftOnly.id))!)).toBeNull();

    const { customer, token } = await makePublished("Deaktiveres");
    expect(await resolvePublished(token)).not.toBeNull();
    await setActive(customer.id, false);
    expect(await resolvePublished(token)).toBeNull();
    await setActive(customer.id, true);
    expect(await resolvePublished(token)).not.toBeNull();
  });

  it("byttet lenke gjør den gamle ugyldig og den nye gyldig", async () => {
    const { customer, token: oldToken } = await makePublished("Rotasjon");
    await rotateToken(customer.id);
    const newToken = (await getRawToken(customer.id))!;
    expect(newToken).not.toBe(oldToken);
    expect(await resolvePublished(oldToken)).toBeNull();
    expect((await resolvePublished(newToken))?.customerId).toBe(customer.id);
  });

  it("tokenet lagres som hash, og råtokenet er minst 32 byte", async () => {
    const { customer, token } = await makePublished("Hash");
    const row = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row.tokenHash).not.toContain(token);
    expect(row.tokenEnc).not.toContain(token);
    expect(Buffer.from(token, "base64url").length).toBeGreaterThanOrEqual(32);
  });

  it("en kundelenke kan ikke hente bilder for andre kunder eller upubliserte bilder", async () => {
    const a = await makePublished("Kunde A");
    const b = await makePublished("Kunde B");
    const up = await saveUpload(b.customer.id, PNG_1X1, "b.png");
    if (!up.ok) throw new Error(up.error);
    // Bildet er ikke i publisert versjon ennå
    const call = (token: string, id: string) => customerMedia(new Request("http://x"), { params: Promise.resolve({ token, assetId: id }) });
    expect((await call(b.token, up.id)).status).toBe(404);
    // Publiser B med bildet: B kan hente, A kan ikke
    const draft = parseContent((await draftOf(b.customer.id)).content);
    draft.heroImageId = up.id;
    await saveDraft(b.customer.id, "Kunde B", draft);
    await publish(b.customer.id);
    expect((await call(b.token, up.id)).status).toBe(200);
    expect((await call(a.token, up.id)).status).toBe(404);
    expect((await call("ugyldig-ugyldig-ugyldig-ugyldig", up.id)).status).toBe(404);
  });

  it("utløpte eller ukjente adminsesjoner avvises", async () => {
    expect(await sessionFromToken(undefined)).toBeNull();
    expect(await sessionFromToken("ukjent")).toBeNull();
  });
});

describe("publiseringsversjoner", () => {
  it("lagret utkast er usynlig på aktiv lenke til publisering, og ny versjon beholder lenken", async () => {
    const { customer, token } = await makePublished("Versjoner");
    const v1 = await resolvePublished(token);
    expect(v1!.version.number).toBe(1);

    const draft = parseContent((await draftOf(customer.id)).content);
    draft.packages[0].priceOre = 777700;
    await saveDraft(customer.id, "Versjoner", draft);
    expect((await resolvePublished(token))!.content.packages[0].priceOre).toBe(600000);

    const r = await publish(customer.id);
    expect(r.ok).toBe(true);
    const v2 = await resolvePublished(token); // samme lenke
    expect(v2!.version.number).toBe(2);
    expect(v2!.content.packages[0].priceOre).toBe(777700);
    // v1 er bevart uendret
    const old = await db.publishedVersion.findUniqueOrThrow({ where: { portalId_number: { portalId: await portalIdOf(customer.id), number: 1 } } });
    expect(parseContent(old.content).packages[0].priceOre).toBe(600000);
  });

  it("publisering krever gyldig innhold", async () => {
    const c = await createCustomer("Tom");
    const r = await publish(c.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/pakke/i);
    expect(await db.publishedVersion.count({ where: { portal: { customerId: c.id } } })).toBe(0);
  });

  it("duplisert kunde får ny lenke, tom historikk og krever nytt navn", async () => {
    const { customer, token } = await makePublished("Original");
    await submitInquiry({ token, versionId: (await resolvePublished(token))!.version.id, idempotencyKey: "dup-test-key-000001", input: validInput() });
    const copy = await duplicateCustomer(customer.id);
    expect(copy.id).not.toBe(customer.id);
    expect((await getRawToken(copy.id))).not.toBe(token);
    expect(await db.inquiry.count({ where: { customerId: copy.id } })).toBe(0);
    expect(await db.publishedVersion.count({ where: { portal: { customerId: copy.id } } })).toBe(0);
    const r = await publish(copy.id);
    expect(r.ok).toBe(false); // needsRename
    await saveDraft(copy.id, "Nytt navn", parseContent((await draftOf(copy.id)).content));
    expect((await publish(copy.id)).ok).toBe(true);
    // gammel lenke viser fortsatt originalen
    expect((await resolvePublished(token))!.customerId).toBe(customer.id);
  });
});

describe("samtidig publisering", () => {
  it("fire samtidige publiseringer gir fire unike versjonsnumre og siste er aktiv", async () => {
    const { customer } = await makePublished("Race AS"); // v1
    const results = await Promise.all(Array.from({ length: 4 }, () => publish(customer.id)));
    expect(results.every((r) => r.ok)).toBe(true);
    const numbers = (await db.publishedVersion.findMany({ where: { portal: { customerId: customer.id } }, orderBy: { number: "asc" } })).map((v) => v.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
    const p = await db.portal.findUniqueOrThrow({ where: { id: await portalIdOf(customer.id) }, include: { currentVersion: true } });
    expect(p.currentVersion?.number).toBe(5);
  });
});
