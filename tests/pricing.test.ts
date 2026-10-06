import { describe, expect, it } from "vitest";
import { formatAddonPrice, parseKroner } from "@/lib/format";
import { contentSchema, publishProblems, publishWarnings } from "@/lib/content";
import { obosContent } from "@/server/seed-data";

describe("parseKroner", () => {
  it.each([
    ["6500", 650000],
    ["6 500", 650000],
    ["6 500", 650000],
    ["16.000", 1600000],
    ["16.000.000", 1600000000],
    ["1.250,50", 125050],
    ["1250,5", 125050],
    ["16,50", 1650],
    ["16.5", 1650],
    ["16.50", 1650],
    ["0", 0],
  ])("tolker «%s» som %i øre", (input, ore) => expect(parseKroner(input)).toBe(ore));

  it.each(["", "  ", "abc", "-5", "1.2345", "1,2,3", "1,234", "12.34.56", "1.25,00", "10 kr", "1e5", "999999999"])(
    "avviser «%s»", (input) => expect(parseKroner(input)).toBeNull());
});

describe("publiseringskrav for pris", () => {
  const base = () => contentSchema.parse(obosContent());

  it("godtar seed-innholdet uten problemer eller advarsler", () => {
    expect(publishProblems(base(), "Kunde", false)).toEqual([]);
    expect(publishWarnings(base())).toEqual([]);
  });

  it("stopper pris på 0 kr, men advarer om svært lave priser", () => {
    const c = base();
    c.packages[0].priceOre = 0;
    expect(publishProblems(c, "Kunde", false).join()).toMatch(/større enn 0 kr/);
    c.packages[0].priceOre = 1600; // «16.000» tolket som 16 kr
    expect(publishProblems(c, "Kunde", false)).toEqual([]);
    expect(publishWarnings(c).join()).toMatch(/bare 16 kr/);
  });

  it("stopper pakker med samme navn, uavhengig av store/små bokstaver", () => {
    const c = base();
    c.packages[1].name = ` ${c.packages[0].name.toUpperCase()} `;
    const p = publishProblems(c, "Kunde", false);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/To pakker heter/);
  });

  it("advarer om prosenttillegg over 100 % og tillegg til 0 kr", () => {
    const c = base();
    c.addons.push({ id: "x", name: "Rush", basis: "percent", amountOre: null, percent: 150, note: "", appliesTo: "both" });
    c.addons.push({ id: "y", name: "Gratis", basis: "one_time", amountOre: 0, percent: null, note: "", appliesTo: "both" });
    const w = publishWarnings(c).join();
    expect(w).toMatch(/Rush: prosenttillegget er over 100/);
    expect(w).toMatch(/Gratis: beløpet er 0 kr/);
  });

  it("viser prosent med komma", () => {
    expect(formatAddonPrice({ id: "x", name: "A", basis: "percent", amountOre: null, percent: 12.5, note: "", appliesTo: "both" })).toContain("12,5");
  });
});
