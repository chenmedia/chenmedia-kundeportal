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

  await page.getByRole("button", { name: /Forespør – Medium event/ }).click();
  await expect(page.getByLabel("Pakke", { exact: true })).toHaveValue("pkg_medium");
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
