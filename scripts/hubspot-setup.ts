import { ensureHubspotSetup } from "../src/server/hubspot-setup";

async function main() {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    console.error("Mangler HUBSPOT_ACCESS_TOKEN (legg den i .env eller i miljøet).");
    process.exit(1);
  }
  const r = await ensureHubspotSetup();
  console.log(r.created.length ? `Opprettet: ${r.created.join(", ")}` : "Alt var allerede satt opp.");
  console.log("\nLegg disse inn som miljøvariabler (Vercel):");
  console.log(`HUBSPOT_PIPELINE_ID=${r.pipelineId}`);
  console.log(`HUBSPOT_STAGE_NEW=${r.stageNewId}`);
}

main().catch((e) => {
  // Bare feilkoden skrives ut: svar fra HubSpot kan inneholde personopplysninger.
  console.error("Oppsettet feilet:", e instanceof Error ? e.message : "ukjent feil");
  process.exit(1);
});
