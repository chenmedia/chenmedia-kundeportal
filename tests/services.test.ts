import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createCustomer, getRawToken, publish, resolvePublished, saveDraft } from "@/server/customers";
import { submitInquiry } from "@/server/inquiries";
import { contentSchema, parseContent, publishProblems, type Content } from "@/lib/content";
import { SERVICES, defaultTexts, offeredKinds, pageTexts, parseServiceKind } from "@/lib/service";
import { obosContent } from "@/server/seed-data";
import { draftOf, makeCustomer, makePublished, setDraftContent, validInput } from "./helpers";

const empty = { introTitle: "", introText: "", ctaLabel: "", galleryTitle: "" };

/** OBOS-innholdet (foto) med to filmpakker og to tillegg som gjelder hver sin tjeneste. */
function mixedContent(): Content {
  const c = obosContent();
  c.packages.push(
    { ...c.packages[0], id: "pkg_film_kort", kind: "film", name: "Aftermovie kort", priceOre: 1800000, coverage: "Inntil 4 timer filming", images: "Én film på 1–2 minutter" },
    { ...c.packages[0], id: "pkg_film_lang", kind: "film", name: "Aftermovie lang", priceOre: 3200000 },
  );
  c.addons.push({ id: "add_drone", name: "Drone", basis: "one_time", amountOre: 400000, percent: null, note: "", appliesTo: "film" });
  c.addons[0].appliesTo = "photo";
  return c;
}

describe("tjenester i innholdet", () => {
  it("innhold publisert før film fantes leses som eventfoto, og tilleggene gjelder begge", () => {
    const old = JSON.parse(JSON.stringify(obosContent()));
    for (const p of old.packages) delete p.kind;
    for (const a of old.addons) delete a.appliesTo;
    const c = contentSchema.parse(old);
    expect(c.packages.every((p) => p.kind === "photo")).toBe(true);
    expect(c.addons.every((a) => a.appliesTo === "both")).toBe(true);
    expect(offeredKinds(c)).toEqual(["photo"]);
  });

  it("offeredKinds følger pakkene i fast rekkefølge, og tomt innhold regnes som foto", () => {
    expect(offeredKinds(mixedContent())).toEqual(["photo", "film"]);
    const film = mixedContent();
    film.packages = film.packages.filter((p) => p.kind === "film");
    expect(offeredKinds(film)).toEqual(["film"]);
    expect(offeredKinds({ packages: [] })).toEqual(["photo"]);
  });

  it("leser tjeneste fra URL og database, og ignorerer alt annet", () => {
    expect(parseServiceKind("foto")).toBe("photo");
    expect(parseServiceKind("photo")).toBe("photo");
    expect(parseServiceKind("film")).toBe("film");
    expect(parseServiceKind("video")).toBeNull();
    expect(parseServiceKind(undefined)).toBeNull();
  });

  it("samme pakkenavn går an på tvers av tjenester, men ikke i samme tjeneste", () => {
    const c = mixedContent();
    c.packages[3].name = c.packages[0].name; // filmpakke med samme navn som fotopakke
    expect(publishProblems(c, "Kunde", false)).toEqual([]);
    c.packages[3].kind = "photo";
    expect(publishProblems(c, "Kunde", false).join()).toMatch(/To pakker heter/);
  });
});

describe("tekster etter tjenester", () => {
  it("foto-kunder får samme tekster som før", () => {
    const t = pageTexts(["photo"], "OBOS", empty);
    expect(t.title).toBe("Eventfotografering for OBOS");
    expect(t.cta).toBe("Send et fotobehov");
    expect(t.showPrintUse).toBe(true);
  });

  it("film og begge får egne tekster, og trykk-valget vises bare med fotopakker", () => {
    expect(pageTexts(["film"], "OBOS", empty)).toMatchObject({ title: "Eventfilm for OBOS", cta: "Send et filmbehov", showPrintUse: false });
    expect(pageTexts(["photo", "film"], "OBOS", empty)).toMatchObject({ title: "Eventfoto og eventfilm for OBOS", cta: "Send en forespørsel", showPrintUse: true });
  });

  it("det admin har skrevet gjelder alltid, men en lagret standardtekst følger pakketypene", () => {
    const own = pageTexts(["photo", "film"], "OBOS", { introTitle: "Hei OBOS", introText: "Egen tekst", ctaLabel: "Book nå", galleryTitle: "Fra fjorårets fest" });
    expect(own).toMatchObject({ title: "Hei OBOS", intro: "Egen tekst", cta: "Book nå", galleryTitle: "Fra fjorårets fest" });
    // OBOS-innholdet har fototeksten lagret som standard. Får kunden filmpakker, skal siden ikke si «fotopakker»
    const stored = { ...empty, introText: defaultTexts(["photo"], "OBOS").intro, ctaLabel: defaultTexts(["photo"], "OBOS").cta };
    expect(pageTexts(["photo", "film"], "OBOS", stored).intro).toBe(defaultTexts(["photo", "film"], "OBOS").intro);
    expect(pageTexts(["photo"], "OBOS", stored).intro).toBe(defaultTexts(["photo"], "OBOS").intro);
  });

  it("nye kunder starter med tomme tekstfelt", async () => {
    const c = await createCustomer("Tomme tekster");
    const content = parseContent((await draftOf(c.id)).content);
    expect([content.introTitle, content.introText, content.ctaLabel]).toEqual(["", "", ""]);
  });
});

describe("forespørsler med foto og film", () => {
  async function mixedPublished(name = "Foto og film AS") {
    const c = await makeCustomer(name);
    await setDraftContent(c.id, mixedContent());
    const r = await publish(c.id);
    if (!r.ok) throw new Error(r.problems.join());
    return { customer: c, token: (await getRawToken(c.id))!, versionId: r.version.id };
  }
  const kindOf = async (customerId: string) => (await db.inquiry.findFirstOrThrow({ where: { customerId }, orderBy: { createdAt: "desc" } })).kind;

  it("tjenesten følger pakken, med pris fra publisert innhold, og e-posten nevner eventfilm", async () => {
    const { customer, token, versionId } = await mixedPublished();
    const r = await submitInquiry({ token, versionId, idempotencyKey: "film-pkg-000000001", input: validInput({ packageId: "pkg_film_kort", service: "photo" }) });
    expect(r.ok).toBe(true);
    const inq = await db.inquiry.findFirstOrThrow({ where: { customerId: customer.id }, include: { emailJobs: true } });
    expect(inq.kind).toBe("film"); // pakken avgjør, ikke skjemaet
    const snap = JSON.parse(inq.snapshot);
    expect(snap.kind).toBe("film");
    expect(snap.package.priceOre).toBe(1800000);
    const team = inq.emailJobs.find((j) => j.type === "team_notification")!;
    expect(team.subject).toContain(SERVICES.film.label);
    expect(team.body).toContain("Tjeneste: Eventfilm");

    await submitInquiry({ token, versionId, idempotencyKey: "foto-pkg-000000001", input: validInput({ packageId: "pkg_lite", service: "film" }) });
    expect(await kindOf(customer.id)).toBe("photo");
  });

  it("uten pakke avgjør kundens valg når siden har begge, ellers den ene tjenesten", async () => {
    const { customer, token, versionId } = await mixedPublished("Annet behov AS");
    await submitInquiry({ token, versionId, idempotencyKey: "annet-film-0000001", input: validInput({ packageId: "other", service: "film" }) });
    expect(await kindOf(customer.id)).toBe("film");
    await submitInquiry({ token, versionId, idempotencyKey: "annet-both-0000001", input: validInput({ packageId: "other", service: "both" }) });
    expect(await kindOf(customer.id)).toBe("both");

    // Kunde med bare fotopakker: «film» i skjemaet kan ikke gjøre forespørselen til film
    const photoOnly = await makePublished("Bare foto AS");
    await submitInquiry({ token: photoOnly.token, versionId: photoOnly.versionId, idempotencyKey: "annet-foto-0000001", input: validInput({ packageId: "other", service: "film" }) });
    expect(await kindOf(photoOnly.customer.id)).toBe("photo");
  });

  it("kundelenken gir hele siden med begge pakketypene, og filmpakker kan ikke forveksles med fotopakker", async () => {
    const { token, versionId, customer } = await mixedPublished("Hele siden AS");
    const pub = (await resolvePublished(token))!;
    expect(offeredKinds(pub.content)).toEqual(["photo", "film"]);
    expect(pub.content.packages.filter((p) => p.kind === "film")).toHaveLength(2);
    // Ukjent pakke gir fortsatt PACKAGE_GONE
    const gone = await submitInquiry({ token, versionId, idempotencyKey: "gone-pkg-00000000001", input: validInput({ packageId: "pkg_finnes_ikke" }) });
    expect(gone).toMatchObject({ ok: false, code: "PACKAGE_GONE" });
    expect(await db.inquiry.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it("nye filmpakker i utkastet påvirker ikke aktiv versjon før publisering", async () => {
    const { customer, token } = await makePublished("Film kommer AS");
    expect(offeredKinds((await resolvePublished(token))!.content)).toEqual(["photo"]);
    const draft = mixedContent();
    await saveDraft(customer.id, customer.name, draft);
    expect(offeredKinds((await resolvePublished(token))!.content)).toEqual(["photo"]);
    await publish(customer.id);
    expect(offeredKinds((await resolvePublished(token))!.content)).toEqual(["photo", "film"]);
  });
});
