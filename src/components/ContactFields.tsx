"use client";

import type { CustomerContact } from "@/lib/customer-contact";

/** Felter for kontaktperson hos bedriften. Alt er valgfritt, og det holder å oppgi bare navn. */
export function ContactFields({ defaults, errors, idPrefix = "c" }: { defaults?: Partial<Record<keyof CustomerContact, string | null>>; errors?: Record<string, string>; idPrefix?: string }) {
  const err = (k: string) => errors?.[k];
  const field = (k: "contactName" | "contactEmail" | "contactPhone", label: string, type: string, autoComplete: string, max: number) => (
    <div>
      <label htmlFor={`${idPrefix}-${k}`} className="field-label">{label} <span className="font-normal text-muted">(valgfritt)</span></label>
      <input
        id={`${idPrefix}-${k}`} name={k} type={type} maxLength={max} autoComplete={autoComplete}
        defaultValue={defaults?.[k] ?? ""} className="input"
        aria-invalid={err(k) ? true : undefined} aria-describedby={err(k) ? `${idPrefix}-${k}-err` : undefined}
      />
      {err(k) && <p id={`${idPrefix}-${k}-err`} className="field-error">{err(k)}</p>}
    </div>
  );
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {field("contactName", "Kontaktperson", "text", "off", 100)}
      {field("contactEmail", "E-post", "email", "off", 200)}
      {field("contactPhone", "Telefon", "tel", "off", 40)}
    </div>
  );
}
