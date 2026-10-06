"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createCustomerAction, type ActionState } from "../../actions";
import { ContactFields } from "@/components/ContactFields";
import { PORTAL_KINDS, PORTALS } from "@/lib/portal";

export default function NewCustomer() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCustomerAction, {});
  return (
    <div className="max-w-3xl">
      <Link href="/admin" className="link text-sm">← Til kundene</Link>
      <h1 className="display text-3xl mt-3">Opprett kunde</h1>
      <p className="mt-2 text-muted">Kunden får ett upublisert utkast per portal. Ingenting vises på kundelenken før du publiserer.</p>
      <form action={action} className="card p-6 mt-6 grid gap-5" noValidate>
        <div>
          <label htmlFor="name" className="field-label">Kundenavn</label>
          <input id="name" name="name" required minLength={2} maxLength={100} defaultValue={state.values?.name ?? ""} className="input" aria-invalid={state.fieldErrors?.name ? true : undefined} aria-describedby={state.fieldErrors?.name ? "err" : undefined} />
          {state.fieldErrors?.name && <p id="err" className="field-error">{state.fieldErrors.name}</p>}
        </div>
        <fieldset className="grid gap-3 border-t border-line pt-5" aria-describedby={state.fieldErrors?.portals ? "err-portals" : undefined}>
          <legend className="title text-base pr-2">Portaler</legend>
          <p className="text-sm text-muted">Kunden får én lenke. Har kunden flere portaler, vises de som faner på siden. Du kan legge til en portal senere.</p>
          {PORTAL_KINDS.map((k) => (
            <label key={k} className="check text-[15px]">
              <input type="checkbox" name="portals" value={k} defaultChecked={state.values ? (state.values.portals ?? "").split(",").includes(k) : k === "photo"} />
              <span>{PORTALS[k].label}</span>
            </label>
          ))}
          {state.fieldErrors?.portals && <p id="err-portals" className="field-error">{state.fieldErrors.portals}</p>}
        </fieldset>
        <fieldset className="grid gap-3 border-t border-line pt-5">
          <legend className="title text-base pr-2">Kontakt hos bedriften</legend>
          <p className="text-sm text-muted">Valgfritt og bare synlig for deg. Vises ikke på kundesiden. Du kan bare oppgi navn.</p>
          <ContactFields defaults={state.values} errors={state.fieldErrors} idPrefix="nc" />
        </fieldset>
        {state.error && !state.fieldErrors && <p role="alert" className="field-error">{state.error}</p>}
        <button className="btn btn-dark self-start" disabled={pending}>{pending ? "Oppretter …" : "Opprett kunde"}</button>
      </form>
    </div>
  );
}
