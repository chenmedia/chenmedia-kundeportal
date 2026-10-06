import { db } from "../src/server/db";
import { createCustomer, publish, getRawToken } from "../src/server/customers";
import { supabaseAuthConfigured } from "../src/server/supabase-auth";
import { obosContent } from "../src/server/seed-data";
import { createAdmin } from "../src/server/admin-core";
import { submitInquiry } from "../src/server/inquiries";

async function main() {
  if (process.env.ADMIN_EMAIL && supabaseAuthConfigured()) {
    await createAdmin(process.env.ADMIN_EMAIL);
    console.log(`Administrator godkjent: ${process.env.ADMIN_EMAIL} (innlogging via Supabase Auth)`);
  } else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await createAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log(`Administrator klar: ${process.env.ADMIN_EMAIL}`);
  } else {
    console.log("Ingen ADMIN_EMAIL/ADMIN_PASSWORD satt. Kjør `npm run admin:create` for å opprette administrator.");
  }

  let obos = await db.customer.findFirst({ where: { name: "OBOS" } });
  if (!obos) {
    obos = await createCustomer("OBOS");
    await db.portalDraft.update({ where: { portalId: (await db.portal.findUniqueOrThrow({ where: { customerId_kind: { customerId: obos.id, kind: "photo" } } })).id }, data: { content: JSON.stringify(obosContent()) } });
    const r = await publish(obos.id);
    if (!r.ok) throw new Error(r.problems.join(" "));
    console.log("OBOS opprettet og publisert som versjon 1. Logg inn i administrasjonen for å kopiere kundelenken.");
  } else {
    console.log("OBOS finnes allerede, hopper over.");
  }

  if (process.env.SEED_DEMO_INQUIRIES === "1") {
    const token = await getRawToken(obos.id);
    const cur = await db.portal.findUnique({ where: { customerId_kind: { customerId: obos.id, kind: "photo" } } });
    if (token && cur?.currentVersionId) {
      const info = { token, versionId: cur.currentVersionId };
      const demos = [
        { key: "seed-demo-00000001", pkg: "pkg_lite", name: "[EKSEMPEL] Sommerfest for ansatte", email: "eksempel1@example.com", who: "Eksempel Person" },
        { key: "seed-demo-00000002", pkg: "other", name: "[EKSEMPEL] Konferanse med stort program", email: "eksempel2@example.com", who: "Eksempel Kontakt" },
      ];
      for (const d of demos) {
        await submitInquiry({
          token: info.token, versionId: info.versionId, idempotencyKey: d.key,
          input: {
            packageId: d.pkg, eventName: d.name, dateUnknown: d.pkg === "other", eventDate: d.pkg === "other" ? "" : "2099-06-15",
            locationUnknown: d.pkg === "other", location: d.pkg === "other" ? "" : "Oslo",
            timeframe: "", description: "Dette er en fiktiv eksempelforespørsel lagt inn av seed-skriptet.",
            contactName: d.who, contactEmail: d.email, contactPhone: "", express: false, printUse: false,
          },
        });
      }
      console.log("Eksempelforespørsler (example.com) er lagt inn.");
    }
  }
}

main().finally(() => db.$disconnect());
