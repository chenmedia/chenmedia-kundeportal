import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { E2E_ENV } from "../playwright.config";

async function obosLink(): Promise<string> {
  return execFileSync("npx", ["tsx", "scripts/customer-path.ts", "OBOS"], { env: { ...process.env, ...E2E_ENV }, encoding: "utf8" }).trim();
}

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-post").fill(E2E_ENV.ADMIN_EMAIL);
  await page.getByLabel("Passord").fill(E2E_ENV.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Logg inn" }).click();
  await expect(page.getByRole("heading", { name: "Kunder", exact: true })).toBeVisible({ timeout: 20_000 });
}

test("kunde: viser pakker, velger pakke, sender forespørsel og admin ser den", async ({ page, browser }) => {
  const link = await obosLink();
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Eventfotografering for OBOS/i);
  await expect(page.getByText(/^6\s000\skr$/)).toBeVisible();
  await expect(page.getByText(/^10\s000\skr$/)).toBeVisible();
  await expect(page.getByText(/^16\s000\skr$/)).toBeVisible();
  await expect(page.getByText("Inntil 20 høyoppløselige ferdig redigerte bilder")).toBeVisible();

  // Skjemaet er skjult til man ber om det
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("Arrangementets navn eller type")).toBeHidden();
  await page.getByRole("button", { name: /Forespør denne pakken – Medium event/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Pakke", { exact: true })).toHaveValue("pkg_medium");
  await expect(page.getByTestId("selected-package")).toContainText("Medium event");
  await expect(page.getByTestId("selected-package")).toContainText(/Fastpris 10\s000\skr eks\. mva\./);
  await expect(page.locator("#foresporsel-heading")).toBeFocused();

  await page.getByRole("button", { name: "Send forespørsel" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Rett opp");
  await expect(page.locator("#err-eventName")).toBeVisible();

  await page.getByLabel("Arrangementets navn eller type").fill("Sommerfest E2E");
  await page.getByLabel("Dato", { exact: true }).fill("2099-06-15");
  await page.getByLabel("Sted", { exact: true }).fill("Oslo");
  await page.getByLabel("Beskrivelse av behovet").fill("Vi trenger fotograf til sommerfesten vår.");
  await page.getByLabel("Kontaktperson").fill("Test Testesen");
  await page.getByLabel("E-post", { exact: true }).fill("test@example.com");

  // Nettverksfeil beholder skjemainnholdet
  await page.route("**/api/k/*/inquiry", (r) => r.abort(), { times: 1 });
  await page.getByRole("button", { name: "Send forespørsel" }).click();
  await expect(page.getByText("Vi fikk ikke sendt forespørselen")).toBeVisible();
  await expect(page.getByLabel("Arrangementets navn eller type")).toHaveValue("Sommerfest E2E");

  await page.getByRole("button", { name: "Send forespørsel" }).click();
  await expect(page.getByText("Takk! Vi har mottatt forespørselen din.")).toBeVisible();
  await expect(page.getByText(/CM-[A-Z0-9]{6}/)).toBeVisible();
  await expect(page.getByText("Vi sender også en kopi på e-post")).toHaveCount(0);

  const admin = await (await browser.newContext()).newPage();
  await adminLogin(admin);
  await admin.goto("/admin/foresporsler");
  await admin.getByRole("link", { name: "Sommerfest E2E" }).click();
  await expect(admin.getByText("Medium event").first()).toBeVisible();
  await expect(admin.getByText(/Fastpris 10.000.kr/)).toBeVisible();
  await expect(admin.getByText("Lokal forhåndsvisning – ikke sendt").first()).toBeVisible();
  await admin.getByLabel("Oppfølgingsstatus").selectOption("following_up");
  await admin.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(admin.getByText("Lagret.")).toBeVisible();
});

test("ugyldig lenke viser nøytral melding uten kundeinfo", async ({ page }) => {
  const res = await page.goto("/k/ugyldig-token-ugyldig-token-ugyldig");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Denne kundesiden er ikke tilgjengelig. Kontakt Chen Media.")).toBeVisible();
  await expect(page.getByText("OBOS")).toHaveCount(0);
});

test("admin: utkast er usynlig for kunde til publisering, deretter ny pris på samme lenke", async ({ page, browser }) => {
  const link = await obosLink();
  await adminLogin(page);
  await page.getByRole("link", { name: "Åpne OBOS" }).click();

  await page.getByLabel("Pris (kr, eks. mva.)").first().fill("6500");
  await page.getByRole("button", { name: "Lagre utkast" }).first().click();
  await expect(page.getByText("Utkastet er lagret.").first()).toBeVisible();

  const cust = await (await browser.newContext()).newPage();
  await cust.goto(link);
  await expect(cust.getByText(/^6\s000\skr$/)).toBeVisible();
  await expect(cust.getByText(/^6\s500\skr$/)).toHaveCount(0);

  await page.getByRole("link", { name: "Forhåndsvis utkast" }).evaluate((a: HTMLAnchorElement) => (a.target = "_self"));
  await page.getByRole("link", { name: "Forhåndsvis utkast" }).click();
  await expect(page.getByText("Forhåndsvisning av utkastet")).toBeVisible();
  await expect(page.getByText(/^6\s500\skr$/)).toBeVisible();
  await page.getByRole("link", { name: "Tilbake til redigering" }).click();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publiser" }).click();
  await expect(page.getByText("Publisert. Kundelenken viser nå den nye versjonen.")).toBeVisible();

  await cust.reload();
  await expect(cust.getByText(/^6\s500\skr$/)).toBeVisible();

  await page.getByRole("link", { name: "Versjonshistorikk" }).click();
  await expect(page.getByText("v2").first()).toBeVisible();
  await expect(page.getByText("v1").first()).toBeVisible();

  // Kundens (uinnloggede) nettleser får ikke tilgang til administrasjonen
  await cust.goto("/admin/foresporsler");
  expect(cust.url()).toContain("/admin/login");
});

test("admin: bytte av lenke gjør gammel lenke ugyldig og ny gyldig", async ({ page, browser }) => {
  const oldLink = await obosLink();
  await adminLogin(page);
  await page.getByRole("link", { name: "Åpne OBOS" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Generer ny lenke" }).click();
  await expect(page.getByText("Ny lenke er generert")).toBeVisible();
  const p = await (await browser.newContext()).newPage();
  expect((await p.goto(oldLink))?.status()).toBe(404);
  expect((await p.goto(await obosLink()))?.status()).toBe(200);
});

test("kunde med foreldet side får beskjed om ny versjon og beholder teksten", async ({ page, browser }) => {
  await page.goto(await obosLink());
  await page.getByTestId("open-form").click();
  await page.getByLabel("Arrangementets navn eller type").fill("Foreldet test");
  await page.getByLabel("Dato", { exact: true }).fill("2099-07-01");
  await page.getByLabel("Sted", { exact: true }).fill("Bergen");
  await page.getByLabel("Beskrivelse av behovet").fill("Skal bekrefte at teksten beholdes ved ny versjon.");
  await page.getByLabel("Kontaktperson").fill("Stale Test");
  await page.getByLabel("E-post", { exact: true }).fill("stale@example.com");
  await page.getByLabel("Pakke", { exact: true }).selectOption("pkg_lite");

  // Admin publiserer en ny versjon mens kunden har siden åpen
  const admin = await (await browser.newContext()).newPage();
  await adminLogin(admin);
  await admin.getByRole("link", { name: "Åpne OBOS" }).click();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Publiser" }).click();
  await expect(admin.getByText("Publisert. Kundelenken viser nå den nye versjonen.")).toBeVisible();

  await page.getByRole("button", { name: "Send forespørsel" }).click();
  await expect(page.getByText("Prislisten er oppdatert mens du fylte ut skjemaet")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Arrangementets navn eller type")).toHaveValue("Foreldet test");
  await expect(page.getByRole("button", { name: "Send forespørsel" })).toBeDisabled();

  // Kunden kan lukke skjemaet for å se de nye prisene, og teksten beholdes når det åpnes igjen
  await expect(page.getByRole("button", { name: "Jeg har gått gjennom den oppdaterte prislisten" })).toBeVisible();
  await page.getByRole("button", { name: "Lukk og se oppdaterte priser" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#pakker")).toBeInViewport();
  await page.getByTestId("open-form").click();
  await expect(page.getByLabel("Arrangementets navn eller type")).toHaveValue("Foreldet test");
  await page.getByLabel("Pakke", { exact: true }).selectOption("pkg_lite");
  await page.getByRole("button", { name: "Send forespørsel" }).click();
  await expect(page.getByText("Takk! Vi har mottatt forespørselen din.")).toBeVisible();

  // Nytt skjema for neste arrangement: tomt, men kontaktopplysningene beholdes
  await page.getByRole("button", { name: "Send en ny forespørsel" }).click();
  await expect(page.getByLabel("Arrangementets navn eller type")).toHaveValue("");
  await expect(page.getByLabel("Kontaktperson")).toHaveValue("Stale Test");
  await expect(page.getByLabel("E-post", { exact: true })).toHaveValue("stale@example.com");
});

test("admin får varsel i nettsiden når en ny forespørsel kommer inn", async ({ page, browser }) => {
  await adminLogin(page);
  const before = await page.getByTestId("new-count").count() ? Number(((await page.getByTestId("new-count").textContent()) ?? "0").replace(/\D/g, "")) : 0;

  const cust = await (await browser.newContext()).newPage();
  await cust.goto(await obosLink());
  await cust.getByTestId("open-form").click();
  await cust.getByLabel("Pakke", { exact: true }).selectOption("other");
  await cust.getByLabel("Arrangementets navn eller type").fill("Varsel-test");
  await cust.getByLabel("Dato er ikke avklart").check();
  await cust.getByLabel("Sted er ikke avklart").check();
  await cust.getByLabel("Beskrivelse av behovet").fill("Tester varsling i nettsiden.");
  await cust.getByLabel("Kontaktperson").fill("Varsel Test");
  await cust.getByLabel("E-post", { exact: true }).fill("varsel@example.com");
  await cust.getByRole("button", { name: "Send forespørsel" }).click();
  await expect(cust.getByText("Takk! Vi har mottatt forespørselen din.")).toBeVisible();

  // Administratoren ser meldingen uten å laste siden på nytt
  const toast = page.getByTestId("inquiry-toast").filter({ hasText: "Varsel-test" });
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("new-count")).toContainText(String(before + 1));
  await expect(page).toHaveTitle(new RegExp(`^\\(${before + 1}\\)`));
  await toast.getByRole("link", { name: "Åpne" }).click();
  await expect(page.getByRole("heading", { name: "Varsel-test" })).toBeVisible();
});

test("admin laster opp bilde, publiserer, og kunden ser bildet via beskyttet rute", async ({ page, browser }) => {
  const link = await obosLink();
  await adminLogin(page);
  await page.getByRole("link", { name: "Åpne OBOS" }).click();

  // Ugyldig fil avvises
  await page.getByLabel("Last opp bilde").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(page.getByRole("alert").filter({ hasText: /gyldig bilde/ })).toBeVisible({ timeout: 20_000 });

  // Gyldig PNG godtas
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Last opp bilde").setInputFiles({ name: "event.png", mimeType: "image/png", buffer: png });
  await expect(page.getByLabel("Alternativtekst")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Alternativtekst").fill("Gjester på en sommerfest");
  await page.getByRole("button", { name: "Lagre utkast" }).first().click();
  await expect(page.getByText("Utkastet er lagret.").first()).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publiser" }).click();
  await expect(page.getByText("Publisert. Kundelenken viser nå den nye versjonen.")).toBeVisible();

  const cust = await (await browser.newContext()).newPage();
  await cust.goto(link);
  const img = cust.getByRole("img", { name: "Gjester på en sommerfest" });
  await expect(img).toBeVisible();
  const src = await img.getAttribute("src");
  expect(src).toMatch(/^\/k\/[^/]+\/media\//);
  // Riktig innhold via kundens lenke, men ikke uten gyldig token og ikke via admin-ruten
  expect((await cust.request.get(src!)).status()).toBe(200);
  expect((await cust.request.get(src!.replace(/^\/k\/[^/]+/, "/k/ugyldig-ugyldig-ugyldig-ugyldig"))).status()).toBe(404);
  expect((await cust.request.get("/admin/media/" + src!.split("/").pop())).status()).toBe(401);
});

test("skjemaet ligger bak knapp: Esc lukker, teksten beholdes, og flytende knapp vises ved scrolling", async ({ page }) => {
  await page.goto(await obosLink());
  const sticky = page.locator(".sticky-cta");
  await expect(sticky).not.toHaveClass(/sticky-cta--on/);

  await page.getByTestId("open-form").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#foresporsel-heading")).toBeFocused();
  await page.getByLabel("Arrangementets navn eller type").fill("Beholdes ved lukking");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByTestId("open-form").click();
  await expect(page.getByLabel("Arrangementets navn eller type")).toHaveValue("Beholdes ved lukking");
  await page.getByRole("button", { name: "Lukk skjema" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect(sticky).toHaveClass(/sticky-cta--on/);
  // Ved bunnfeltet skjules den, så den ikke dekker bunnteksten
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(sticky).not.toHaveClass(/sticky-cta--on/);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect(sticky).toHaveClass(/sticky-cta--on/);
  await sticky.getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("skjemaet: markering som slippes over bakgrunnen lukker ikke dialogen", async ({ page }) => {
  await page.goto(await obosLink());
  await page.getByTestId("open-form").click();
  const field = page.getByLabel("Arrangementets navn eller type");
  await field.fill("Markert tekst");
  const box = (await field.boundingBox())!;
  const vp = page.viewportSize()!;
  // Trykk i feltet og slipp helt ute på bakgrunnen (utenfor panelet)
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.width - 4, vp.height / 2);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Et ekte klikk på bakgrunnen lukker den fortsatt
  await page.mouse.click(vp.width - 4, vp.height / 2);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("admin: store bilder og feilmerkede filer komprimeres til WebP (maks 1600 px) før opplasting", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: "Åpne OBOS" }).click();

  const base = sharp({ create: { width: 3200, height: 2000, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } });
  const bigJpeg = await base.clone().jpeg({ quality: 95 }).toBuffer();
  expect(bigJpeg.length).toBeGreaterThan(1_000_000);
  // AVIF som utgir seg for å være JPEG (typisk for bilder lastet ned fra nettsider)
  const disguised = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#c25a2e" } }).avif().toBuffer();

  await page.getByLabel("Last opp bilde").setInputFiles([
    { name: "stort-bilde.jpg", mimeType: "image/jpeg", buffer: bigJpeg },
    { name: "feilmerket.jpg", mimeType: "image/jpeg", buffer: disguised },
  ]);
  const library = page.getByRole("list", { name: "Bildebibliotek" });
  await expect(library.getByText("feilmerket.jpg")).toBeVisible({ timeout: 30_000 });
  await expect(library.getByText("stort-bilde.jpg")).toBeVisible();
  await expect(page.locator("p[role=alert]")).toHaveCount(0); // ingen opplastingsfeil

  const src = await library.locator("li", { hasText: "stort-bilde.jpg" }).locator("img").getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.headers()["content-type"]).toBe("image/webp");
  const body = await res.body();
  const meta = await sharp(body).metadata();
  expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
  expect(body.length).toBeLessThan(bigJpeg.length / 2);
});

test("admin legger inn galleri og pakkebilde, kunden ser dem, og utskriften skjuler dem", async ({ page, browser }) => {
  const link = await obosLink();
  await adminLogin(page);
  await page.getByRole("link", { name: "Åpne OBOS" }).click();

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Last opp bilde").setInputFiles([
    { name: "galleri-1.png", mimeType: "image/png", buffer: png },
    { name: "galleri-2.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.getByRole("list", { name: "Bildebibliotek" }).getByText("galleri-2.png")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("list", { name: "Bildebibliotek" }).getByText("galleri-1.png")).toBeVisible();

  await page.getByRole("button", { name: "+ Legg til galleribilde" }).click();
  await page.getByRole("button", { name: "+ Legg til galleribilde" }).click();
  await page.getByLabel("Beskrivelse av bildet").first().fill("Foredrag på scenen");
  await page.getByLabel("Beskrivelse av bildet").nth(1).fill("Mingling etter programmet");
  await page.getByLabel("Overskrift (valgfritt)").fill("Fra tidligere arrangementer");
  await page.getByLabel("Bilde på pakkekortet (valgfritt)").first().selectOption({ label: "galleri-1.png" });
  await page.getByLabel("Beskrivelse av pakkebildet").fill("Fotograf i arbeid");

  await page.getByRole("button", { name: "Lagre utkast" }).first().click();
  await expect(page.getByText("Utkastet er lagret.").first()).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publiser" }).click();
  await expect(page.getByText("Publisert. Kundelenken viser nå den nye versjonen.")).toBeVisible();

  const cust = await (await browser.newContext()).newPage();
  await cust.goto(link);
  await expect(cust.getByRole("heading", { name: "Fra tidligere arrangementer" })).toBeVisible();
  const gallery = cust.locator("#galleri");
  await expect(gallery.getByRole("img", { name: "Foredrag på scenen" })).toBeVisible();
  await expect(gallery.getByRole("img", { name: "Mingling etter programmet" })).toBeVisible();
  const pkgImg = cust.getByRole("img", { name: "Fotograf i arbeid" });
  await expect(pkgImg).toBeVisible();
  // Bildene serveres via den beskyttede kunderuten og faktisk lastes
  expect(await pkgImg.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await pkgImg.getAttribute("src")).toMatch(/^\/k\/[^/]+\/media\//);

  // Utskrift: bildene skjules, og en side holder
  await cust.emulateMedia({ media: "print" });
  await expect(gallery).toBeHidden();
  await expect(pkgImg).toBeHidden();
  await cust.close();
});

test("utskrift: knapper og dialog skjules, priser og vilkår beholdes", async ({ page }) => {
  await page.goto(await obosLink());
  await expect(page.getByRole("button", { name: /Skriv ut eller lagre som PDF/ })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("open-form")).toBeHidden();
  await expect(page.locator(".sticky-cta")).toBeHidden();
  await expect(page.getByRole("button", { name: /Forespør denne pakken – Medium event/ })).toBeHidden();
  await expect(page.getByText(/^10\s000\skr$/)).toBeVisible();
  await expect(page.getByText("Betalingsfrist: 30 dager.")).toBeVisible();
  // Bunnteksten skal være lesbar (ikke hvit på hvit), og prislisten får plass på én A4-side
  await expect(page.locator(".site-footer h2").first()).toHaveCSS("color", "rgb(17, 17, 17)");
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  expect(pdf.length).toBeGreaterThan(10_000);
  expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
});

test("lenkeforhåndsvisning er nøytral: ingen kundenavn eller priser i metadata", async ({ page }) => {
  await page.goto(await obosLink());
  const og = await page.locator('meta[property="og:title"], meta[property="og:description"]').evaluateAll((els) => els.map((e) => e.getAttribute("content") ?? ""));
  expect(og.join(" ")).toContain("Chen Media");
  expect(og.join(" ")).not.toMatch(/OBOS|kr\b|\d{3}/);
  expect(await page.title()).toBe("Fotopakker og priser | Chen Media");
  const img = await page.request.get("/brand/og.png");
  expect(img.status()).toBe(200);
});

test("admin: kunde kan opprettes med bare navn på kontaktperson, og kontakten kan endres", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: "Opprett kunde" }).click();
  await page.waitForURL("**/admin/kunder/ny");
  await page.waitForLoadState("networkidle"); // vent til overgangen er ferdig før vi skriver
  await page.getByLabel("Kundenavn").fill("Kontakttest AS");
  // Ugyldig e-post avvises, men tom e-post er greit
  await page.getByLabel("E-post (valgfritt)").fill("ikke-epost");
  await page.getByRole("button", { name: "Opprett kunde" }).click();
  await expect(page.getByText("Skriv en gyldig e-postadresse, eller la feltet stå tomt.")).toBeVisible();
  // Innskrevne verdier beholdes ved valideringsfeil (React nullstiller ellers skjemaet)
  await expect(page.getByLabel("Kundenavn")).toHaveValue("Kontakttest AS");
  await expect(page.getByLabel("E-post (valgfritt)")).toHaveValue("ikke-epost");
  await page.getByLabel("E-post (valgfritt)").fill("");
  await page.getByLabel("Kontaktperson (valgfritt)").fill("Ola Kontakt");
  await page.getByRole("button", { name: "Opprett kunde" }).click();

  // På redigeringssiden: kontakt er lagret, og e-post/telefon er tomme
  await expect(page.getByRole("heading", { name: "Kontakttest AS" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Kontaktperson (valgfritt)")).toHaveValue("Ola Kontakt");
  await expect(page.getByLabel("E-post (valgfritt)")).toHaveValue("");

  await page.getByLabel("E-post (valgfritt)").fill("ola@kontakt.no");
  await page.getByRole("button", { name: "Lagre kontakt" }).click();
  await expect(page.getByText("Kontakten er lagret.")).toBeVisible();

  // Oversikten viser kontaktpersonen under kundenavnet
  await page.goto("/admin");
  await expect(page.getByRole("row", { name: /Kontakttest AS/ })).toContainText("Ola Kontakt");
});

test("kontaktperson hos bedriften vises ikke på kundesiden", async ({ page, browser }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: "Åpne OBOS" }).click();
  await page.getByLabel("Kontaktperson (valgfritt)").fill("Skjult Person");
  await page.getByRole("button", { name: "Lagre kontakt" }).click();
  await expect(page.getByText("Kontakten er lagret.")).toBeVisible();
  const cust = await (await browser.newContext()).newPage();
  await cust.goto(await obosLink());
  await expect(cust.getByText("Skjult Person")).toHaveCount(0);
});
