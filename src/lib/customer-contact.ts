import { z } from "zod";
import { isEmail } from "./content";

/** Kontaktperson hos bedriften. Alt er valgfritt: det holder å oppgi bare navn (eller bare e-post). */
export interface CustomerContact {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

const optional = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .optional()
    .transform((v) => (v ? v : null));

export const customerContactSchema = z
  .object({
    contactName: optional(100, "Maks 100 tegn."),
    contactEmail: optional(200, "Maks 200 tegn."),
    contactPhone: optional(40, "Maks 40 tegn."),
  })
  .superRefine((v, ctx) => {
    // E-post er valgfri, men hvis den er oppgitt må den være gyldig.
    if (v.contactEmail && !isEmail(v.contactEmail)) {
      ctx.addIssue({ code: "custom", path: ["contactEmail"], message: "Skriv en gyldig e-postadresse, eller la feltet stå tomt." });
    }
  });

export const EMPTY_CONTACT: CustomerContact = { contactName: null, contactEmail: null, contactPhone: null };

export function parseContactForm(fd: FormData): { ok: true; contact: CustomerContact } | { ok: false; fieldErrors: Record<string, string> } {
  const r = customerContactSchema.safeParse({
    contactName: String(fd.get("contactName") ?? ""),
    contactEmail: String(fd.get("contactEmail") ?? ""),
    contactPhone: String(fd.get("contactPhone") ?? ""),
  });
  if (r.success) return { ok: true, contact: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { ok: false, fieldErrors };
}
