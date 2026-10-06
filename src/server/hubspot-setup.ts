import { hs } from "./hubspot";

/**
 * Engangsoppsett i HubSpot: egen dealpipeline for forespørsler og egendefinerte dealegenskaper.
 * Trygt å kjøre flere ganger: det som finnes fra før (på navn/etikett) røres ikke.
 * Kjøres med `npm run hubspot:setup` (krever HUBSPOT_ACCESS_TOKEN med skriverettigheter for deals-skjema).
 */

export const PIPELINE_LABEL = "Forespørsler";

export const STAGES = [
  { label: "Ny forespørsel", probability: "0.1" },
  { label: "Avklarer", probability: "0.3" },
  { label: "Tilbud sendt", probability: "0.6" },
  { label: "Booket", probability: "1.0", closed: true },
  { label: "Tapt", probability: "0.0", closed: true },
] as const;

type Prop = { name: string; label: string; type: "string" | "date"; fieldType: "text" | "date"; unique?: boolean; description: string };

export const PROPERTIES: Prop[] = [
  { name: "kundeportal_referanse", label: "Kundeportal: referanse", type: "string", fieldType: "text", unique: true, description: "Referansen fra kundeportalen. Brukes til å unngå duplikater." },
  { name: "kundeportal_lenke", label: "Kundeportal: lenke til forespørsel", type: "string", fieldType: "text", description: "Lenke til forespørselen i kundeportalens admin." },
  { name: "kundeportal_pakke", label: "Kundeportal: pakke", type: "string", fieldType: "text", description: "Pakken kunden valgte." },
  { name: "kundeportal_avtale", label: "Kundeportal: avtaleversjon", type: "string", fieldType: "text", description: "Avtale og versjon kunden så prisene i." },
  { name: "arrangementsdato", label: "Arrangementsdato", type: "date", fieldType: "date", description: "Dato for arrangementet, hvis avklart." },
  { name: "arrangementssted", label: "Arrangementssted", type: "string", fieldType: "text", description: "Sted for arrangementet, hvis avklart." },
];

export interface SetupResult {
  pipelineId: string;
  stageNewId: string;
  created: string[];
}

interface Pipeline { id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }

export async function ensureHubspotSetup(): Promise<SetupResult> {
  const created: string[] = [];

  const list = (await hs("GET", "/crm/v3/pipelines/deals")) as { results?: Pipeline[] } | null;
  let pipeline = list?.results?.find((p) => p.label === PIPELINE_LABEL);
  if (!pipeline) {
    pipeline = (await hs("POST", "/crm/v3/pipelines/deals", {
      label: PIPELINE_LABEL,
      displayOrder: 10,
      stages: STAGES.map((s, i) => ({
        label: s.label,
        displayOrder: i,
        metadata: { probability: s.probability, ...("closed" in s ? { isClosed: "true" } : {}) },
      })),
    })) as unknown as Pipeline;
    created.push(`pipeline «${PIPELINE_LABEL}»`);
  }
  const first = [...pipeline.stages].sort((a, b) => a.displayOrder - b.displayOrder)[0];
  if (!first) throw new Error("Pipelinen mangler steg");

  const existing = (await hs("GET", "/crm/v3/properties/deals")) as { results?: { name: string }[] } | null;
  const have = new Set((existing?.results ?? []).map((p) => p.name));
  for (const p of PROPERTIES) {
    if (have.has(p.name)) continue;
    await hs("POST", "/crm/v3/properties/deals", {
      name: p.name, label: p.label, type: p.type, fieldType: p.fieldType, description: p.description,
      groupName: "dealinformation", ...(p.unique ? { hasUniqueValue: true } : {}),
    });
    created.push(`egenskap ${p.name}`);
  }

  return { pipelineId: pipeline.id, stageNewId: first.id, created };
}
