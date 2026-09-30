# Chen Media Kundepriser

Digitale kundeprislister for eventfoto. Kunden får en hemmelig lenke (`/k/<token>`), ser pakker og priser, og sender en forespørsel. Administrator (Chen Media) styrer alt under `/admin`. Se `README.md` for oppsett, miljøvariabler og drift.

## Struktur og regler

- `src/app/` sider, ruter og server actions. Skal være tynne. **Ikke importer `@/server/db` eller `@prisma/client` her**, det stoppes av lint.
- `src/components/` React-komponenter. Kundesiden (`CustomerPage`) brukes også i admin-forhåndsvisning og versjonsvisning.
- `src/server/` all forretningslogikk og all databasetilgang:
  - `queries.ts` lesemodeller for admin (sider henter data herfra)
  - `customers.ts`, `inquiries.ts` skriving og regler (publisering, innsending, tilgang)
  - `email.ts`, `storage.ts`, `media.ts`, `supabase-auth.ts` adaptere mot eksterne tjenester
  - `log.ts` feillogging uten personopplysninger. Bruk `logError` i alle serverfeil-stier
- `src/lib/` ren logikk uten databasetilgang: `content.ts` (innholdsmodell og publiseringskrav), `format.ts` (priser og datoer), `inquiry.ts` (skjema og statuser).
- `prisma/migrations/` skjemaendringer. Endringer må kjøres mot Supabase før koden som trenger dem slås sammen.

## Domeneregler som ikke skal brytes

- Priser lagres i øre. Datoer i UTC, vist i Europe/Oslo.
- Publiserte versjoner er uforanderlige. Forespørsler lagrer et øyeblikksbilde av pris og innhold.
- Pris og kunde hentes alltid fra publisert innhold på serveren, aldri fra skjemaet.
- Kundelenken lagres som SHA-256-hash (pluss kryptert kopi for «Kopier lenke»). Logg aldri tokens, komplette lenker, passord eller skjemadata.
- Ugyldig, deaktivert og upublisert lenke skal gi identisk nøytral 404.
- Kunder logger aldri inn. Bare administratorer (Supabase Auth i drift, godkjenningsliste i `AdminUser`).

## Kommandoer

```bash
npm run typecheck && npm run lint && npm test   # tester krever Postgres (se README)
CHROMIUM_PATH=... npx playwright test           # E2E
npm run build
```

Tester nullstiller databasene `*_test` og `*_e2e` og nekter å røre andre.

## Arbeidsflyt

`main` er produksjon. Jobb på egen branch, åpne PR mot `main`, la CI gå grønt og sjekk Vercel-forhåndsvisningen før sammenslåing. UI-tekst og kommentarer er på norsk bokmål, kode og identifikatorer på engelsk (unntatt domenebegreper og rutenavn).
