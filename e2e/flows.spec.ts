import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
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
  await page.getByRole("button", { name: /Forespør – Medium event/ }).click();
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

  await page.getByRole("button", { name: "Jeg har gått gjennom den oppdaterte prislisten" }).click();
  await page.getByRole("button", { name: "Send forespørsel" }).click();
  await expect(page.getByText("Takk! Vi har mottatt forespørselen din.")).toBeVisible();
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
  await sticky.getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
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
