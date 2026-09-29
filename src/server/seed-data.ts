import { Content, contentSchema } from "@/lib/content";

/** Eksakte seed-data for OBOS (spesifikasjon pkt. 14). Alle priser eks. mva. */
export function obosContent(): Content {
  return contentSchema.parse({
    introTitle: "",
    introText:
      "Her finner du deres avtalte fotopakker og priser. Send oss informasjon om arrangementet, så avklarer vi tilgjengelighet og detaljer.",
    ctaLabel: "Send et fotobehov",
    heroImageId: null,
    heroImageAlt: "",
    agreementLabel: "Prisliste V2026",
    validityText: "",
    contactName: "Kai",
    contactEmail: "kai@chenmedia.no",
    packages: [
      {
        id: "pkg_lite", name: "Lite event", priceType: "fixed", priceOre: 600000,
        coverage: "Inntil 2 timer fotografering",
        images: "Inntil 20 høyoppløselige ferdig redigerte bilder",
        usage: "Full ubegrenset digital bruksrett",
        delivery: "Levering innen 3 virkedager",
      },
      {
        id: "pkg_medium", name: "Medium event", priceType: "fixed", priceOre: 1000000,
        coverage: "Inntil 4 timer fotografering",
        images: "Inntil 40 høyoppløselige ferdig redigerte bilder",
        usage: "Full ubegrenset digital bruksrett",
        delivery: "Levering innen 3 virkedager",
      },
      {
        id: "pkg_stort", name: "Stort event", priceType: "from", priceOre: 1600000, custom: true,
        priceNote: "Endelig pris settes i et skreddersydd tilbud.",
        description: "For større arrangementer eller spesielle behov setter vi gjerne sammen et skreddersydd tilbud.",
      },
    ],
    addons: [
      { id: "add_timer", name: "Ekstra timer", basis: "per_hour", amountOre: 200000 },
      { id: "add_express", name: "Ekspresslevering innen 24 timer, lite/medium", basis: "one_time", amountOre: 250000 },
      { id: "add_express_stort", name: "Ekspresslevering innen 24 timer, stort event", basis: "percent", percent: 20, note: "Beregningsgrunnlaget avklares i tilbudet." },
      { id: "add_hast", name: "Hastegebyr ved oppdrag samme uke", basis: "one_time", amountOre: 250000 },
      { id: "add_trykk", name: "Bruksrett til trykk", basis: "from_per_image", amountOre: 35000, note: "Engangsbruk." },
    ],
    practical: ["Kjøring og parkering tilkommer.", "Betalingsfrist: 30 dager.", "Alle priser er ekskl. mva."],
  });
}
