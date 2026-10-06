# Chen Media Kundepriser (beta)

Digitale kundeprislister for eventfoto. Chen Media setter opp én fast lenke per kunde med
forhåndsavtalte pakker, tillegg og vilkår. Kunden ser prisene og sender en strukturert forespørsel
fra samme side. Erstatter PDF-en og den løse e-postprosessen.

Status: **beta / første fungerende utkast. Ikke produksjonsklar** (se «Før drift»).

## Teknologi og versjoner

Next.js 15.5 (App Router) · React 19 · TypeScript 5.9 · Tailwind CSS 4 · Prisma 6.19 + Postgres (Supabase) ·
Zod 3 · Vitest 3 · Playwright 1.63 · Node 22. Versjonene er låst (`package.json` + `package-lock.json`).

Design følger *Chen Media Brandguideline V1*: Chen Svart `#111111`, Chen Krem `#FBF8D0`, hvit, én
aksent (terrakotta `#C25A2E`, bare på knapper, understreker og statusprikker). Helvetica (versaler)
til titler, Open Sans til brødtekst, Merriweather til ingress, Space Mono til etiketter. Fontene
(unntatt Helvetica, som er systemfont) hentes lokalt via `@fontsource`, ingen Google-kall.
Logo og krusedull (`public/brand/`) er klippet ut av brandguiden som PNG. **Bytt gjerne med
originale vektorfiler.**

## Kom i gang (lokalt)

Trenger en Postgres-database. Har du Docker: `docker run -d -p 5433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`
og `createdb -h localhost -p 5433 -U postgres kundepriser_dev` (og tilsvarende `kundepriser_test`, `kundepriser_e2e`
for testene). Annen Postgres går også: sett `DATABASE_URL` / `DIRECT_URL` i `.env`.

```bash
npm install
cp .env.example .env        # sett ADMIN_PASSWORD (min. 12 tegn) og gjerne APP_SECRET
npm run db:setup            # kjører migrasjoner og seeder OBOS (+ administrator)
npm run dev                 # http://localhost:3000
```

- **Administrasjon:** http://localhost:3000/admin (logg inn med `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- **Kundeside (OBOS):** åpne OBOS i administrasjonen og bruk **Kopier lenke**. Lenken er
  `/k/<hemmelig token>`. Tokenet skrives aldri til terminal eller logg.
- **Opprette/oppdatere administrator senere:** `npm run admin:create` (spør etter e-post/passord).
- **Seed** kan kjøres flere ganger uten duplikater. OBOS-innholdet er de eksakte tallene fra
  spesifikasjonen (Lite 6 000 kr, Medium 10 000 kr, Stort fra 16 000 kr, tillegg og praktisk info).
  To tydelig merkede eksempelforespørsler (`example.com`) legges inn når `SEED_DEMO_INQUIRIES=1`.
- **Bilder på kundesiden:** ett eventbilde øverst, et galleri (inntil 6 bilder, oppsettet følger antall) mellom pakker og tillegg, og valgfritt ett bilde per pakke. Alt settes i administrasjonen under «Bilder» og «Pakker». Innholdet er JSON, så ingen databasemigrering trengs.
- **Utskrift / PDF:** kundesiden har en egen A4-stil (`@media print` i `globals.css`) som følger nettsiden: kremfarget side, hvite avrundede kort, pakkene side om side, svart «Praktisk»-flate og svart bunnfelt. Knapper, dialog, galleri og pakkebilder skjules (heltebildet beholdes), og standardinnholdet holder seg til én side. Bakgrunnsfarger skrives ut selv om «Bakgrunnsgrafikk» er av. Utskrift fra admin-forhåndsvisning og arkiv skjuler admin-skallet. Filnavnet blir «Chen Media - Prisliste <kunde> - <avtale>.pdf» (sidetittelen byttes bare mens utskriftsdialogen er åpen). Tips: slå av «Topptekster og bunntekster» i utskriftsdialogen, ellers skriver nettleseren lenken (med token) i bunnen av PDF-en.
- **Bilder lokalt** lagres på disk i `STORAGE_DIR`. Med `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  satt brukes Supabase Storage i stedet (samme kode som i drift).

## Miljøvariabler

| Variabel | Formål |
|---|---|
| `DATABASE_URL` | Postgres. I drift: Supabase **pooler**-adressen (port 6543) med `?pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | Direkte Postgres-adresse (port 5432). Brukes til migrasjoner. |
| `APP_SECRET` | Krypterer kundelenker som lagres for «Kopier lenke». **Påkrevd i produksjon** (min. 16 tegn). Byttes den, kan gamle lenker ikke vises (generer ny lenke). |
| `APP_URL` | Offentlig adresse, brukes til å bygge kundelenker. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Bildelagring i Supabase Storage (privat bucket, standard `kundeportal-media`). Service-nøkkelen brukes bare på serveren og må aldri eksponeres i nettleseren. |
| `STORAGE_DIR` | Kun lokal utvikling uten Supabase. Virker ikke på Vercel. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Brukes av seed / `admin:create`. Ingen hardkodet passord finnes. |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Aktiverer ekte e-post via Resend. Tomt = lokal utboks. |
| `NOTIFY_EMAIL` | Mottaker av varsel om nye forespørsler (faller ellers tilbake til kontakt-e-posten på kundesiden). |
| `SEED_DEMO_INQUIRIES` | `1` legger inn to eksempelforespørsler ved seed. |

## Vercel + Supabase

Vercel har ingen varig disk, derfor brukes Supabase for data (Postgres) og bilder (Storage). Appen
er klargjort (`vercel.json`, region `cdg1` (Paris) nær Supabase-prosjektet i eu-west-3), men **ikke deployet**.

1. **Supabase:** bruk et aktivt prosjekt. Kjør migrasjonene mot **DIRECT_URL**:
   `DATABASE_URL=<direct> DIRECT_URL=<direct> npm run db:migrate`. Kjør deretter
   `supabase/setup-storage.sql` i SQL Editor (oppretter den private bucketen).
   Migrasjonen slår på Row Level Security uten policies på alle tabeller, slik at Supabase' åpne
   Data API ikke kan lese kundedata, tokens eller passordhasher med anon-nøkkelen.
   *Tips:* deler prosjektet database med andre apper, bruk et eget skjema (`?schema=kundepriser`).
2. **Vercel → Environment Variables (Production):** Med Supabase-integrasjonen koblet til prosjektet
   dekkes databasen og bildelagringen automatisk: appen bruker `POSTGRES_PRISMA_URL`/`POSTGRES_URL`
   hvis `DATABASE_URL` mangler, og `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` leveres av integrasjonen.
   Det du selv må sette er `APP_SECRET` (Sensitive) og `APP_URL`. For migrasjoner lokalt bruker du
   `POSTGRES_URL_NON_POOLING` som `DIRECT_URL`. Full liste: `DATABASE_URL` (pooler), `DIRECT_URL`, `APP_SECRET`,
   `APP_URL` (den offentlige adressen), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_STORAGE_BUCKET`, `NOTIFY_EMAIL`. Marker nøkler og passord som *Sensitive*.
3. **Vercel → Settings → Deployment Protection:** slå av *Vercel Authentication* for produksjon.
   Ellers møter kundene en Vercel-innlogging i stedet for prislisten. Kundelenken (32 byte tilfeldig
   token) er tilgangsbeskyttelsen. Innhold beskyttes av `noindex` og `no-store`.
4. **Administratorer og innlogging:** I drift (når `SUPABASE_URL` og en publisert/anon-nøkkel finnes) sjekkes
   passordet hos **Supabase Auth**. Hvem som er administrator bestemmes av tabellen `AdminUser`
   (godkjenningsliste): en Supabase-bruker uten rad der får ingen tilgang. Legg til en administrator ved å
   opprette brukeren i Supabase (Authentication → Users) og kjøre
   `DATABASE_URL=<direct> DIRECT_URL=<direct> ADMIN_EMAIL=... npm run admin:create` (eller sette inn raden i
   `AdminUser`). **Slå av offentlig registrering** i Supabase (Authentication → Sign In / Providers → «Allow new
   users to sign up»). Passordendring og tilbakestilling gjøres i Supabase-dashbordet. Appen har ingen egen
   glemt-passord-side, og Supabase' innebygde e-post er begrenset til testing.
   Uten Supabase-oppsett (lokal utvikling) brukes passordhash i `AdminUser` som før.
   Seed (`npm run db:seed`) legger inn OBOS. Kjør den bare hvis du vil ha demo-kunden i produksjon.
5. Koble GitHub-repoet til Vercel-prosjektet og deploy.

Bilder lastes opp direkte fra nettleseren til Supabase Storage med en kortlevd signert URL (Vercel
tillater bare ca. 4,5 MB gjennom en funksjon). Serveren validerer filformatet etterpå og sletter ugyldige
filer. Kunder får bildet via en tilgangskontrollert rute som videresender til en signert URL på 60 sekunder.

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
npm test            # Vitest (Postgres *_test-database): tilgangskontroll, versjoner, prisøyeblikk,
                    # doble innsendinger, e-post, bildevalidering og lagringsadapter
npm run build       # produksjonsbygg
# E2E (Playwright). Bruker databasen *_e2e og port 3100:
CHROMIUM_PATH=/sti/til/chromium npx playwright test   # utelat CHROMIUM_PATH hvis `npx playwright install chromium` er kjørt
```

## Kjente begrensninger (beta)

- Én administratorrolle, ingen passordtilbakestilling (bruk `npm run admin:create`).
- Kun ett eventbilde per kundeside. Opplastede filer fjernes ikke fra lagringen når de ikke lenger brukes.
- **Supabase Storage-integrasjonen er testet mot mockede svar, ikke mot et levende prosjekt.**
  Prøv bildeopplasting i et forhåndsvisningsmiljø før kunder får lenker.
- Testene nullstiller databasene `*_test` og `*_e2e` og nekter å røre andre databaser.
- Rate limiting bruker `x-forwarded-for`, som bare er pålitelig bak en proxy du kontrollerer.
- E-post er bare testet mot mockede svar. **Ekte levering via Resend er ikke verifisert.**
- Ingen automatisk gjenoppretting av gamle versjoner (kopier manuelt inn i utkastet).
- Logoen er raster (PNG) hentet fra brandguiden. Helvetica faller tilbake til Arial/Liberation Sans
  på maskiner uten Helvetica.

## Før drift

Dette må avklares og verifiseres før kunder får lenker:

1. **Faktisk e-postlevering** (avsenderdomene med SPF/DKIM, `RESEND_API_KEY`, test mot ekte innboks).
   Inntil videre gir appen varsling i nettsiden (teller, melding og fanetittel) for administrator.
2. **Supabase og Vercel satt opp** som beskrevet over, inkludert avskrudd Vercel Authentication og
   verifisert bildeopplasting mot ekte Storage.
3. **Sikkerhetskopi:** sjekk Supabase-planens backup/PITR for databasen. Storage-filer sikkerhetskopieres ikke automatisk.
4. Ønsket tilgangsnivå: kundelenken er en delbar nøkkel. Alle med lenken ser prisene.
5. Gjennomgang av personverntekst og eventuell slettefrist (ikke oppfunnet her).

## Arbeidsflyt

- `main` er produksjon (Vercel publiserer bare herfra; alle andre branches får kun forhåndsvisning).
- Endringer gjøres på en egen branch og slås sammen til `main` via pull request. Vercel lager en egen
  forhåndsvisnings-URL for hver branch/PR, som kan sjekkes før kundene ser endringen.
- Databaseendringer (nye filer i `prisma/migrations/`) må kjøres mot Supabase **før** koden som trenger dem
  slås sammen. Se «Vercel + Supabase» over.
