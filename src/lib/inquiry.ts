import { z } from "zod";
import { isEmail, type AddonContent, type PackageContent } from "./content";
import { todayInOslo } from "./format";

export const inquiryInputSchema = z
  .object({
    packageId: z.string().min(1, "Velg en pakke, eller «Usikker / annet behov»."),
    eventName: z.string().trim().min(2, "Skriv minst 2 tegn.").max(150, "Maks 150 tegn."),
    dateUnknown: z.boolean().default(false),
    eventDate: z.string().trim().default(""),
    locationUnknown: z.boolean().default(false),
    location: z.string().trim().max(200, "Maks 200 tegn.").default(""),
    timeframe: z.string().trim().max(150, "Maks 150 tegn.").default(""),
    description: z.string().trim().min(10, "Skriv minst 10 tegn.").max(3000, "Maks 3000 tegn."),
    contactName: z.string().trim().min(2, "Skriv minst 2 tegn.").max(100, "Maks 100 tegn."),
    contactEmail: z.string().trim().refine(isEmail, "Skriv en gyldig e-postadresse, for eksempel navn@firma.no."),
    contactPhone: z.string().trim().max(40, "Maks 40 tegn.").default(""),
    express: z.boolean().default(false),
    printUse: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!v.dateUnknown) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.eventDate)) {
        ctx.addIssue({ code: "custom", path: ["eventDate"], message: "Velg en dato, eller kryss av for «Dato er ikke avklart»." });
      } else if (v.eventDate < todayInOslo()) {
        ctx.addIssue({ code: "custom", path: ["eventDate"], message: "Datoen har passert. Velg en dato fra i dag av." });
      }
    }
    if (!v.locationUnknown && v.location.length < 2) {
      ctx.addIssue({ code: "custom", path: ["location"], message: "Skriv sted, eller kryss av for «Sted er ikke avklart»." });
    }
  });
export type InquiryInput = z.infer<typeof inquiryInputSchema>;

export const OTHER_PACKAGE = "other";

export const STATUS_LABELS: Record<string, string> = {
  new: "Ny",
  following_up: "Under oppfølging",
  clarified: "Avklart",
  closed: "Avsluttet",
};
export const STATUSES = Object.keys(STATUS_LABELS);

export interface InquirySnapshot {
  customerName: string;
  agreementLabel: string;
  versionNumber: number;
  package: PackageContent | null;
  addons: AddonContent[];
  practical: string[];
  /** Kontaktpersonen i avtalen (navnet i kvitteringen). Eldre forespørsler mangler feltet. */
  contactName?: string;
}
