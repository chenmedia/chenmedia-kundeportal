import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createCustomer, duplicateCustomer, publish, resolvePublished, getRawToken, updateCustomerContact } from "@/server/customers";
import { customerContactSchema, parseContactForm } from "@/lib/customer-contact";
import { obosContent } from "@/server/seed-data";

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

describe("kontakt hos bedriften: validering", () => {
  it("alt er valgfritt, og tomme felt blir null", () => {
    const r = parseContactForm(form({ contactName: "", contactEmail: "  ", contactPhone: "" }));
    expect(r).toEqual({ ok: true, contact: { contactName: null, contactEmail: null, contactPhone: null } });
  });
  it("det holder å oppgi bare navn", () => {
    const r = parseContactForm(form({ contactName: "  Ola Nordmann ", contactEmail: "", contactPhone: "" }));
    expect(r).toEqual({ ok: true, contact: { contactName: "Ola Nordmann", contactEmail: null, contactPhone: null } });
  });
  it("e-post avvises bare hvis den er oppgitt og ugyldig", () => {
    const bad = parseContactForm(form({ contactName: "Ola", contactEmail: "ikke-epost" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors.contactEmail).toMatch(/gyldig/);
    expect(parseContactForm(form({ contactEmail: "ola@firma.no" })).ok).toBe(true);
  });
  it("lengdegrenser", () => {
    expect(customerContactSchema.safeParse({ contactName: "x".repeat(101) }).success).toBe(false);
    expect(customerContactSchema.safeParse({ contactPhone: "1".repeat(41) }).success).toBe(false);
  });
});

describe("kontakt hos bedriften: lagring", () => {
  it("kunde kan opprettes uten kontakt, med bare navn, og kontakt kan endres og fjernes", async () => {
    const a = await createCustomer("Uten kontakt AS");
    expect([a.contactName, a.contactEmail, a.contactPhone]).toEqual([null, null, null]);

    const b = await createCustomer("Bare navn AS", { contactName: "Kari", contactEmail: null, contactPhone: null });
    expect([b.contactName, b.contactEmail]).toEqual(["Kari", null]);

    await updateCustomerContact(b.id, { contactName: "Kari", contactEmail: "kari@firma.no", contactPhone: "+47 900 00 000" });
    expect((await db.customer.findUniqueOrThrow({ where: { id: b.id } })).contactEmail).toBe("kari@firma.no");

    await updateCustomerContact(b.id, { contactName: null, contactEmail: null, contactPhone: null });
    const cleared = await db.customer.findUniqueOrThrow({ where: { id: b.id } });
    expect([cleared.contactName, cleared.contactEmail, cleared.contactPhone]).toEqual([null, null, null]);
  });

  it("kontakten kopieres ikke ved duplisering (ny bedrift)", async () => {
    const src = await createCustomer("Original AS", { contactName: "Per", contactEmail: "per@original.no", contactPhone: null });
    const copy = await duplicateCustomer(src.id);
    expect([copy.contactName, copy.contactEmail]).toEqual([null, null]);
  });

  it("kontakten havner aldri i publisert innhold eller på kundesiden", async () => {
    const c = await createCustomer("Skjult kontakt AS", { contactName: "Hemmelig Person", contactEmail: "skjult@firma.no", contactPhone: "99999999" });
    await db.customerDraft.update({ where: { customerId: c.id }, data: { content: JSON.stringify(obosContent()) } });
    const r = await publish(c.id);
    expect(r.ok).toBe(true);
    const pub = await resolvePublished((await getRawToken(c.id))!);
    const json = JSON.stringify(pub);
    expect(json).not.toContain("Hemmelig Person");
    expect(json).not.toContain("skjult@firma.no");
    expect(json).not.toContain("99999999");
  });
});
