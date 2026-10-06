import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DraftConflictError, publish, restoreVersionAsDraft, saveDraft } from "@/server/customers";
import { inquiriesForExport, inquiryList } from "@/server/queries";
import { submitInquiry } from "@/server/inquiries";
import { csvCell, toCsv } from "@/lib/csv";
import { STATUSES, STATUS_LABELS } from "@/lib/inquiry";
import { contentSchema, parseContent } from "@/lib/content";
import { draftOf, makeCustomer, makePublished, validInput } from "./helpers";

describe("CSV", () => {
  it("siterer felt med skilletegn, linjeskift og anførselstegn", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('si "hei"')).toBe('"si ""hei"""');
    expect(csvCell("linje1\nlinje2")).toBe('"linje1\nlinje2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("nøytraliserer formler fra innsendt tekst (CSV-injeksjon)", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("Vanlig tekst - med bindestrek")).toBe("Vanlig tekst - med bindestrek");
  });

  it("lager semikolonseparert UTF-8 med BOM og CRLF", () => {
    const out = toCsv([["Navn", "By"], ["Ola", "Tromsø"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿Navn;By\r\nOla;Tromsø\r\n");
  });
});

describe("statuser", () => {
  it("har booket og tapt, og alle har norsk tekst", () => {
    expect(STATUSES).toEqual(expect.arrayContaining(["new", "following_up", "clarified", "booked", "lost", "closed"]));
    expect(STATUS_LABELS.booked).toBe("Booket");
    expect(STATUS_LABELS.lost).toBe("Tapt");
  });
});

describe("samtidige endringer i utkastet", () => {
  it("avviser lagring når noen andre har lagret i mellomtiden, og godtar riktig forventet tidspunkt", async () => {
    const c = await makeCustomer("Samtidig AS");
    const opened = (await draftOf(c.id)).updatedAt.toISOString();
    const content = parseContent((await draftOf(c.id)).content);

    const first = await saveDraft(c.id, "Samtidig AS", { ...content, introTitle: "Første" }, opened);
    await expect(saveDraft(c.id, "Samtidig AS", { ...content, introTitle: "Andre" }, opened)).rejects.toBeInstanceOf(DraftConflictError);
    expect(parseContent((await draftOf(c.id)).content).introTitle).toBe("Første");

    // Med det nye tidspunktet går det bra, og overskriving uten forventet tidspunkt er alltid mulig
    const second = await saveDraft(c.id, "Samtidig AS", { ...content, introTitle: "Andre" }, first.updatedAt.toISOString());
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    await saveDraft(c.id, "Samtidig AS", { ...content, introTitle: "Overskrevet" });
    expect(parseContent((await draftOf(c.id)).content).introTitle).toBe("Overskrevet");
  });

  it("endrer ikke kundenavnet når lagringen avvises", async () => {
    const c = await makeCustomer("Navn før");
    const opened = (await draftOf(c.id)).updatedAt.toISOString();
    const content = parseContent((await draftOf(c.id)).content);
    await saveDraft(c.id, "Navn før", content, opened);
    await expect(saveDraft(c.id, "Navn etter", content, opened)).rejects.toBeInstanceOf(DraftConflictError);
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).name).toBe("Navn før");
  });

  it("avviser ugyldig tidspunkt", async () => {
    const c = await makeCustomer("Ugyldig tid");
    const content = parseContent((await draftOf(c.id)).content);
    await expect(saveDraft(c.id, "Ugyldig tid", content, "ikke-en-dato")).rejects.toBeInstanceOf(DraftConflictError);
  });
});

describe("gjenopprett versjon som utkast", () => {
  it("kopierer innholdet inn i utkastet uten å røre publiserte versjoner", async () => {
    const { customer } = await makePublished("Gjenopprett AS");
    const draft = parseContent((await draftOf(customer.id)).content);
    const v1Price = draft.packages[0].priceOre;
    draft.packages[0].priceOre = 777700;
    await saveDraft(customer.id, "Gjenopprett AS", draft);
    expect((await publish(customer.id)).ok).toBe(true);
    const versionsBefore = await db.publishedVersion.findMany({ where: { portal: { customerId: customer.id } }, orderBy: { number: "asc" } });
    expect(versionsBefore).toHaveLength(2);

    expect(await restoreVersionAsDraft(customer.id, 1)).toBe(true);
    const restored = parseContent((await draftOf(customer.id)).content);
    expect(restored.packages[0].priceOre).toBe(v1Price);
    expect(await db.publishedVersion.findMany({ where: { portal: { customerId: customer.id } }, orderBy: { number: "asc" } })).toEqual(versionsBefore);
    expect(await restoreVersionAsDraft(customer.id, 99)).toBe(false);
  });

  it("holder seg til kundens eget navn, ikke navnet versjonen hadde", async () => {
    const { customer } = await makePublished("Gammelt navn");
    const draft = parseContent((await draftOf(customer.id)).content);
    await saveDraft(customer.id, "Nytt navn", draft);
    await restoreVersionAsDraft(customer.id, 1);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).name).toBe("Nytt navn");
  });
});

describe("søk og eksport av forespørsler", () => {
  it("søker i arrangement, kontakt, e-post, referanse og kunde, og teller totalt", async () => {
    const { customer, token, versionId } = await makePublished("Søkbar Kunde AS");
    const tag = Math.random().toString(36).slice(2, 8);
    const refs: string[] = [];
    for (let n = 0; n < 3; n++) {
      const r = await submitInquiry({
        token, versionId, idempotencyKey: `sok-key-${tag}-${n}-0000000`,
        input: validInput({ eventName: `Sommerfest ${tag} ${n}`, contactName: `Kari ${tag}`, contactEmail: `kari-${tag}@example.com` }),
      });
      if (!r.ok) throw new Error("innsending feilet");
      refs.push(r.reference);
    }
    const byEvent = await inquiryList({ q: `sommerfest ${tag}` });
    expect(byEvent.total).toBe(3);
    expect((await inquiryList({ q: `KARI-${tag}@EXAMPLE` })).total).toBe(3);
    expect((await inquiryList({ q: refs[1].toLowerCase() })).list.map((i) => i.reference)).toEqual([refs[1]]);
    expect((await inquiryList({ q: "Søkbar Kunde", customerId: customer.id })).total).toBe(3);
    expect((await inquiryList({ q: `ingenting-${tag}` })).total).toBe(0);

    // Antall begrenses, men totalen er hele treffet
    const page = await inquiryList({ q: tag }, 2);
    expect(page.list).toHaveLength(2);
    expect(page.total).toBe(3);
    expect((await inquiriesForExport({ q: tag }))).toHaveLength(3);
    expect((await inquiriesForExport({ q: tag, status: "booked" }))).toHaveLength(0);
  });
});

describe("innholdsmodell", () => {
  it("godtar fortsatt tomt innhold", () => expect(() => contentSchema.parse({})).not.toThrow());
});
