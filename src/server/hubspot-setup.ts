import { hs, hubspotPipelineId, hubspotStageId } from "./hubspot";

/**
 * Engangsoppsett i HubSpot: oppretter de egendefinerte dealegenskapene og sjekker at pipelinen og steget forespørslene
 * skal inn i finnes. Trygt å kjøre flere ganger: egenskaper som finnes fra før røres ikke.
 * Kjøres med `npm run hubspot:setup` (krever HUBSPOT_ACCESS_TOKEN med lese- og skriverettigheter for deals-skjema).
 */

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
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  created: string[];
}

interface Pipeline { id: string; label: string; stages: { id: string; label: string }[] }

export async function ensureHubspotSetup(): Promise<SetupResult> {
  const list = (await hs("GET", "/crm/v3/pipelines/deals")) as { results?: Pipeline[] } | null;
  const pipeline = list?.results?.find((p) => p.id === hubspotPipelineId());
  if (!pipeline) throw new Error(`Fant ikke dealpipelinen «${hubspotPipelineId()}» (sett HUBSPOT_PIPELINE_ID)`);
  const stage = pipeline.stages.find((s) => s.id === hubspotStageId());
  if (!stage) throw new Error(`Fant ikke steget «${hubspotStageId()}» i «${pipeline.label}» (sett HUBSPOT_STAGE_NEW)`);

  const created: string[] = [];
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

  return { pipelineId: pipeline.id, pipelineLabel: pipeline.label, stageId: stage.id, stageLabel: stage.label, created };
}
