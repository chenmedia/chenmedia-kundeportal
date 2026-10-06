-- Tjenesten en forespørsel gjelder (eventfoto, eventfilm eller begge). Eksisterende forespørsler er eventfoto.
-- Bare en ny kolonne med standardverdi: koden som kjører fra før ignorerer den, så migrasjonen kan kjøres før sammenslåing.
ALTER TABLE "Inquiry" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'photo';
