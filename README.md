# Chen Media Kundepriser (beta)

Digitale kundeprislister for eventfoto. Chen Media setter opp én fast lenke per kunde med
forhåndsavtalte pakker, tillegg og vilkår. Kunden ser prisene og sender en strukturert forespørsel
fra samme side. Erstatter PDF-en og den løse e-postprosessen.

Status: **beta / første fungerende utkast. Ikke produksjonsklar** (se «Før drift»).

## Teknologi og versjoner

Next.js 15.5 (App Router) · React 19 · TypeScript 5.9 · Tailwind CSS 4 · Prisma 6.19 + SQLite ·
Zod 3 · Vitest 3 · Playwright 1.63 · Node 22. Versjonene er låst (`package.json` + `package-lock.json`).

Design følger *Chen Media Brandguideline V1*: Chen Svart `#111111`, Chen Krem `#FBF8D0`, hvit, én
aksent (terrakotta `#C25A2E`, bare på knapper, understreker og statusprikker). Helvetica (versaler)
til titler, Open Sans til brødtekst, Merriweather til ingress, Space Mono til etiketter. Fontene
(unntatt Helvetica, som er systemfont) hentes lokalt via `@fontsource`, ingen Google-kall.
Logo og krusedull (`public/brand/`) er klippet ut av brandguiden som PNG. **Bytt gjerne med
originale vektorfiler.**

## Kom i gang

```bash
npm install
cp .env.example .env        # sett ADMIN_PASSWORD (min. 12 tegn) og gjerne APP_SECRET
npm run db:setup            # oppretter SQLite-databasen og seeder OBOS (+ administrator)
npm run dev                 # http://localhost:3000
```

- **Administrasjon:** http://localhost:3000/admin (logg inn med `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- **Kundeside (OBOS):** åpne OBOS i administrasjonen og bruk **Kopier lenke**. Lenken er
  `/k/<hemmelig token>`. Tokenet skrives aldri til terminal eller logg.
- **Opprette/oppdatere administrator senere:** `npm run admin:create` (spør etter e-post/passord).
- **Seed** kan kjøres flere ganger uten duplikater. OBOS-innholdet er de eksakte tallene fra
  spesifikasjonen (Lite 6 000 kr, Medium 10 000 kr, Stort fra 16 000 kr, tillegg og praktisk info).
  To tydelig merkede eksempelforespørsler (`example.com`) legges inn når `SEED_DEMO_INQUIRIES=1`.

## Miljøvariabler

| Variabel | Formål |
|---|---|
| `DATABASE_URL` | SQLite, f.eks. `file:./dev.db?connection_limit=1` (sti relativ til `prisma/`). `connection_limit=1` anbefales for SQLite. |
| `APP_SECRET` | Krypterer kundelenker som lagres for «Kopier lenke». **Påkrevd i produksjon** (min. 16 tegn). Byttes den, kan gamle lenker ikke vises (generer ny lenke). |
| `APP_URL` | Offentlig adresse, brukes til å bygge kundelenker. |
| `STORAGE_DIR` | Mappe for opplastede bilder (utenfor `public/`). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Brukes av seed / `admin:create`. Ingen hardkodet passord finnes. |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Aktiverer ekte e-post via Resend. Tomt = lokal utboks. |
| `NOTIFY_EMAIL` | Mottaker av varsel om nye forespørsler (faller ellers tilbake til kontakt-e-posten på kundesiden). |
| `SEED_DEMO_INQUIRIES` | `1` legger inn to eksempelforespørsler ved seed. |

## Slik fungerer det

- **Utkast og publisering:** redigering skjer i et utkast som aldri vises på kundelenken. «Publiser»
  lager en uforanderlig versjon og gjør den aktiv i én transaksjon. Samme lenke, ny versjon, historikk
  bevares (`/admin/kunder/[id]/versjoner`).
- **Forespørsler** lagrer et øyeblikksbilde av kundenavn, pakke, pris og vilkår slik kunden så dem,
  og hvilken versjon siden var. Priser og kunde hentes alltid fra publisert innhold på serveren.
- **Foreldet side:** hvis en ny versjon publiseres mens kunden fyller ut skjemaet, avvises innsendingen
  (409), siden hentes på nytt, teksten beholdes i minnet, og kunden må bekrefte gjennomgang.
- **Doble innsendinger:** hver innsending har en engangsnøkkel (unik i databasen). Forespørsel og
  begge e-postjobber lagres i én atomisk skriving.
- **Varsling i nettsiden (midlertidig):** så lenge e-postleverandør ikke er koblet på, får innlogget
  administrator en teller i menyen («Forespørsler 2»), en melding nederst til høyre når en ny forespørsel
  kommer inn (kontrolleres hvert 15. sekund og ved fokus), og antallet i fanetittelen. Dette fungerer bare
  mens administrasjonen er åpen i en nettleser. Nye forespørsler vises også øverst på kundeoversikten.
- **E-post:** utskiftbar leverandøradapter (`src/server/email.ts`, Resend støttes). Uten leverandør
  havner e-postene i **E-postutboksen** (`/admin/utboks`, kun innlogget), merket
  «Lokal forhåndsvisning – ikke sendt». Feilede utsendinger kan prøves på nytt fra forespørselen.
  Kundens adresse er *Reply-To*, aldri avsender.
- **Tilgang:** tokens er 32 tilfeldige byte, lagres som SHA-256-hash (pluss kryptert kopi til
  «Kopier lenke»). Ugyldig, deaktivert og upublisert lenke gir samme nøytrale 404-side. Bilder serveres
  bare via tilgangskontrollerte ruter, og en kundelenke får bare bilder fra egen publiserte versjon.
  Admin bruker HttpOnly-sesjonscookie (SameSite=Lax, Secure i produksjon), scrypt-hashet passord,
  begrensning av innloggingsforsøk og skjemainnsending, honeypot-felt, `Referrer-Policy: no-referrer`,
  `Cache-Control: private, no-store` og `noindex`. Ingen analyse eller sporing.

## Tester og kontroller

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm test            # Vitest: tilgangskontroll, versjoner, prisøyeblikk, doble innsendinger, e-post, bilder
npm run build       # produksjonsbygg
# E2E (Playwright). Bruker egen database og port 3100:
CHROMIUM_PATH=/sti/til/chromium npx playwright test   # utelat CHROMIUM_PATH hvis `npx playwright install chromium` er kjørt
```

## Kjente begrensninger (beta)

- Én administratorrolle, ingen passordtilbakestilling (bruk `npm run admin:create`).
- Kun ett eventbilde per kundeside. Opplastede filer fjernes ikke fra disk når de ikke lenger brukes.
- Rate limiting bruker `x-forwarded-for`, som bare er pålitelig bak en proxy du kontrollerer.
- E-post er bare testet mot mockede svar. **Ekte levering via Resend er ikke verifisert.**
- Ingen automatisk gjenoppretting av gamle versjoner (kopier manuelt inn i utkastet).
- Logoen er raster (PNG) hentet fra brandguiden. Helvetica faller tilbake til Arial/Liberation Sans
  på maskiner uten Helvetica.

## Før drift

Dette må avklares og verifiseres før kunder får lenker:

1. **Faktisk e-postlevering** (avsenderdomene med SPF/DKIM, `RESEND_API_KEY`, test mot ekte innboks).
2. **HTTPS** og riktig `APP_URL`. Sett `APP_SECRET` og ta vare på den.
3. **Varig lagring og sikkerhetskopi** av både SQLite-filen og `STORAGE_DIR`, eller flytt til en
   driftsdatabase/objektlagring (Prisma-skjema og lagringsfunksjonene er isolert for dette).
4. Hosting-plattform (ikke valgt). Fungerer overalt der en Node-prosess har persistent disk.
5. Ønsket tilgangsnivå: kundelenken er en delbar nøkkel. Alle med lenken ser prisene.
6. Gjennomgang av personverntekst og eventuell slettefrist (ikke oppfunnet her).
