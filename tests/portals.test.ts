import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  addPortal, createCustomer, duplicateCustomer, getRawToken, publish, resolvePublished, resolvePublishedPortals, restoreVersionAsDraft, saveDraft,
  DraftConflictError,
} from "@/server/customers";
import { submitInquiry } from "@/server/inquiries";
import { saveUpload } from "@/server/media";
import { GET as customerMedia } from "@/app/k/[token]/media/[assetId]/route";
import { parseContent, type Content } from "@/lib/content";
import { PORTALS, parsePortalKind, sortKinds } from "@/lib/portal";
import { obosContent } from "@/server/seed-data";
import { draftOf, makeCustomer, PNG_1X1, portalIdOf, setDraftContent, validInput } from "./helpers";

/** Filminnhold med egne pakke-ID-er og priser, så det ikke kan forveksles med fotoinnholdet. */
function filmContent(): Content {
  return parseContent(JSON.stringify({
    ...obosContent(),
    agreementLabel: "Filmavtale V2026",
    packages: [{ id: "pkg_film_kort", name: "Aftermovie kort", priceType: "fixed", priceOre: 1800000, coverage: "Inntil 4 timer filming", images: "Én film på 1–2 minutter" }],
    addons: [],
    practical: ["Alle priser er ekskl. mva."],
  }));
}

async function bothPublished(name = "Foto og film AS") {
  const c = await makeCustomer(name, ["photo", "film"]);
  await setDraftContent(c.id, filmContent(), "film");
  const photo = await publish(c.id, "photo");
  const film = await publish(c.id, "film");
  if (!photo.ok || !film.ok) throw new Error("publisering feilet");
  return { customer: c, token: (await getRawToken(c.id))!, photoVersionId: photo.version.id, filmVersionId: film.version.id };
}

describe("portaltyper", () => {
  it("leser portaltype fra database-verdi og URL-slug, og ignorerer alt annet", () => {
    expect(parsePortalKind("photo")).toBe("photo");
    expect(parsePortalKind("foto")).toBe("photo");
    expect(parsePortalKind("film")).toBe("film");
    expect(parsePortalKind("video")).toBeNull();
    expect(parsePortalKind(undefined)).toBeNull();
    expect(sortKinds([{ kind: "film" }, { kind: "photo" }]).map((p) => p.kind)).toEqual(["photo", "film"]);
  });
});

describe("opprette kunde og portaler", () => {
  it("standard er bare eventfoto, med fotoens standardtekster i utkastet", async () => {
    const c = await createCustomer("Bare foto");
    const portals = await db.portal.findMany({ where: { customerId: c.id } });
    expect(portals.map((p) => p.kind)).toEqual(["photo"]);
    expect(parseContent((await draftOf(c.id)).content).ctaLabel).toBe(PORTALS.photo.cta);
  });

  it("kan opprettes med begge portalene, og filmutkastet får filmtekster", async () => {
    const c = await createCustomer("Begge", undefined, ["film", "photo"]);
    const portals = await db.portal.findMany({ where: { customerId: c.id } });
    expect(portals.map((p) => p.kind).sort()).toEqual(["film", "photo"]);
    const film = parseContent((await draftOf(c.id, "film")).content);
    expect(film.ctaLabel).toBe(PORTALS.film.cta);
    expect(film.introText).toBe(PORTALS.film.intro);
    await expect(createCustomer("Ingen", undefined, [])).rejects.toThrow();
  });

  it("addPortal legger til eventfilm med kontakt og vilkår fra foto, men uten pakker, og gjør ingenting hvis den finnes", async () => {
    const c = await makeCustomer("Legg til film");
    expect(await addPortal(c.id, "film")).toBe(true);
    const film = parseContent((await draftOf(c.id, "film")).content);
    expect(film.contactEmail).toBe("kai@chenmedia.no");
    expect(film.practical).toEqual(obosContent().practical);
    expect(film.packages).toEqual([]);
    expect(film.ctaLabel).toBe(PORTALS.film.cta);
    expect(await addPortal(c.id, "film")).toBe(false);
    expect(await addPortal("finnes-ikke", "film")).toBe(false);
    expect(await db.portal.count({ where: { customerId: c.id } })).toBe(2);
  });
});

describe("hver portal har eget utkast og egne versjoner", () => {
  it("lagring og publisering i den ene portalen rører ikke den andre", async () => {
    const { customer, token } = await bothPublished();
    const photoDraft = parseContent((await draftOf(customer.id, "photo")).content);
    photoDraft.packages[0].priceOre = 777700;
    await saveDraft(customer.id, customer.name, photoDraft, undefined, "photo");
    expect(parseContent((await draftOf(customer.id, "film")).content).packages[0].priceOre).toBe(1800000);
    expect((await resolvePublished(token, "photo"))!.content.packages[0].priceOre).toBe(600000);

    await publish(customer.id, "photo");
    expect((await resolvePublished(token, "photo"))!.version.number).toBe(2);
    // Film er uendret på v1
    const film = (await resolvePublished(token, "film"))!;
    expect(film.version.number).toBe(1);
    expect(film.content.packages[0].priceOre).toBe(1800000);
  });

  it("utkast-konflikt gjelder per portal", async () => {
    const { customer } = await bothPublished("Konflikt AS");
    const openedFilm = (await draftOf(customer.id, "film")).updatedAt.toISOString();
    // Noen lagrer fotoutkastet etter at filmsiden ble åpnet: filmlagringen skal ikke avvises
    await saveDraft(customer.id, customer.name, parseContent((await draftOf(customer.id, "photo")).content), undefined, "photo");
    const film = parseContent((await draftOf(customer.id, "film")).content);
    await saveDraft(customer.id, customer.name, film, openedFilm, "film");
    // Men lagrer noen filmutkastet først, avvises neste lagring med den gamle verdien
    await expect(saveDraft(customer.id, customer.name, film, openedFilm, "film")).rejects.toBeInstanceOf(DraftConflictError);
  });

  it("gjenoppretting henter versjon fra riktig portal", async () => {
    const { customer } = await bothPublished("Gjenopprett begge");
    const film = parseContent((await draftOf(customer.id, "film")).content);
    film.packages[0].priceOre = 2500000;
    await saveDraft(customer.id, customer.name, film, undefined, "film");
    expect(await restoreVersionAsDraft(customer.id, 1, "film")).toBe(true);
    expect(parseContent((await draftOf(customer.id, "film")).content).packages[0].priceOre).toBe(1800000);
    // Versjon 1 i fotoportalen er et annet innhold, og endres ikke av gjenopprettingen
    expect(parseContent((await draftOf(customer.id, "photo")).content).packages[0].id).toBe("pkg_lite");
  });

  it("publisering avvises for en portal kunden ikke har", async () => {
    const c = await makeCustomer("Bare foto uten film");
    await expect(publish(c.id, "film")).rejects.toThrow();
    await expect(saveDraft(c.id, c.name, obosContent(), undefined, "film")).rejects.toThrow();
  });
});

describe("kundelenken med flere portaler", () => {
  it("gir valgt portal, ellers den første publiserte, og lister fanene", async () => {
    const { token } = await bothPublished();
    const photo = await resolvePublished(token);
    expect(photo!.kind).toBe("photo");
    expect(photo!.available).toEqual(["photo", "film"]);
    const film = await resolvePublished(token, "film");
    expect(film!.kind).toBe("film");
    expect(film!.content.agreementLabel).toBe("Filmavtale V2026");
    expect((await resolvePublished(token, null))!.kind).toBe("photo");
  });

  it("virker med bare eventfilm publisert, og ber om foto gir film (ingen 404 på gyldig lenke)", async () => {
    const c = await makeCustomer("Kun film publisert", ["photo", "film"]);
    await setDraftContent(c.id, filmContent(), "film");
    const r = await publish(c.id, "film");
    expect(r.ok).toBe(true);
    const token = (await getRawToken(c.id))!;
    const pub = await resolvePublished(token, "photo");
    expect(pub!.kind).toBe("film");
    expect(pub!.available).toEqual(["film"]);
  });

  it("gir nøytral null når ingen portal er publisert, og når kunden er deaktivert", async () => {
    const c = await makeCustomer("Ingen publisert", ["photo", "film"]);
    const token = (await getRawToken(c.id))!;
    expect(await resolvePublished(token)).toBeNull();
    expect(await resolvePublished(token, "film")).toBeNull();
    expect(await resolvePublishedPortals(token)).toBeNull();
    await publish(c.id, "photo");
    expect(await resolvePublished(token)).not.toBeNull();
    await db.customer.update({ where: { id: c.id }, data: { active: false } });
    expect(await resolvePublished(token)).toBeNull();
  });

  it("bilder som bare brukes i filmportalen kan hentes med lenken, men ikke bilder som bare ligger i utkastet", async () => {
    const c = await makeCustomer("Bilder film", ["photo", "film"]);
    const used = await saveUpload(c.id, PNG_1X1, "film.png");
    const unused = await saveUpload(c.id, PNG_1X1, "utkast.png");
    if (!used.ok || !unused.ok) throw new Error("opplasting feilet");
    const film = filmContent();
    film.heroImageId = used.id;
    await saveDraft(c.id, c.name, film, undefined, "film");
    await publish(c.id, "photo");
    await publish(c.id, "film");
    const token = (await getRawToken(c.id))!;
    const call = (id: string) => customerMedia(new Request("http://x"), { params: Promise.resolve({ token, assetId: id }) });
    expect((await call(used.id)).status).toBe(200);
    expect((await call(unused.id)).status).toBe(404);
  });

  it("duplisering kopierer alle portalene som utkast, uten versjoner", async () => {
    const { customer } = await bothPublished("Original begge");
    const copy = await duplicateCustomer(customer.id);
    expect((await db.portal.findMany({ where: { customerId: copy.id } })).map((p) => p.kind).sort()).toEqual(["film", "photo"]);
    expect(parseContent((await draftOf(copy.id, "film")).content).packages[0].id).toBe("pkg_film_kort");
    expect(await db.publishedVersion.count({ where: { portal: { customerId: copy.id } } })).toBe(0);
  });
});

describe("forespørsler per portal", () => {
  it("film: pris og pakke hentes fra filminnholdet, forespørselen merkes og e-posten nevner eventfilm", async () => {
    const { customer, token, filmVersionId } = await bothPublished("Film-forespørsel");
    const r = await submitInquiry({ token, versionId: filmVersionId, idempotencyKey: "film-inq-0000000001", input: validInput({ packageId: "pkg_film_kort" }) });
    expect(r.ok).toBe(true);
    const inq = await db.inquiry.findFirstOrThrow({ where: { customerId: customer.id }, include: { emailJobs: true } });
    expect(inq.kind).toBe("film");
    expect(inq.versionId).toBe(filmVersionId);
    const snap = JSON.parse(inq.snapshot);
    expect(snap.kind).toBe("film");
    expect(snap.package.priceOre).toBe(1800000);
    expect(snap.agreementLabel).toBe("Filmavtale V2026");
    const team = inq.emailJobs.find((j) => j.type === "team_notification")!;
    expect(team.subject).toContain("Eventfilm");
    expect(team.body).toContain("Tjeneste: Eventfilm");
  });

  it("foto: kind er photo, og fotopakke kan ikke sendes inn mot filmversjonen", async () => {
    const { customer, token, photoVersionId, filmVersionId } = await bothPublished("Foto-forespørsel");
    const ok = await submitInquiry({ token, versionId: photoVersionId, idempotencyKey: "foto-inq-0000000001", input: validInput({ packageId: "pkg_lite" }) });
    expect(ok.ok).toBe(true);
    expect((await db.inquiry.findFirstOrThrow({ where: { customerId: customer.id } })).kind).toBe("photo");
    const wrong = await submitInquiry({ token, versionId: filmVersionId, idempotencyKey: "foto-inq-0000000002", input: validInput({ packageId: "pkg_lite" }) });
    expect(wrong).toEqual({ ok: false, code: "PACKAGE_GONE", currentVersionId: filmVersionId });
  });

  it("foreldet versjon i én portal gir STALE_VERSION med den portalens aktive versjon", async () => {
    const { customer, token, filmVersionId } = await bothPublished("Foreldet film");
    const again = await publish(customer.id, "film");
    if (!again.ok) throw new Error("publisering feilet");
    const r = await submitInquiry({ token, versionId: filmVersionId, idempotencyKey: "stale-film-00000001", input: validInput({ packageId: "pkg_film_kort" }) });
    expect(r).toEqual({ ok: false, code: "STALE_VERSION", currentVersionId: again.version.id });
    // Fotoportalen er uberørt
    expect(await portalIdOf(customer.id, "photo")).not.toBe(await portalIdOf(customer.id, "film"));
  });
});
