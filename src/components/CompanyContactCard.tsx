"use client";

import { useActionState } from "react";
import type { CustomerContact } from "@/lib/customer-contact";
import { updateContactAction, type ActionState } from "@/app/admin/actions";
import { ContactFields } from "./ContactFields";

export function CompanyContactCard({ customerId, contact }: { customerId: string; contact: CustomerContact }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateContactAction.bind(null, customerId), {});
  return (
    <section className="card p-5 md:p-6" aria-labelledby="bedriftskontakt">
      <h2 id="bedriftskontakt" className="title text-lg">Kontakt hos bedriften</h2>
      <p className="text-sm text-muted mt-1">Valgfritt og bare synlig for deg. Vises ikke på kundesiden. Det holder å oppgi navn.</p>
      <form action={action} className="mt-4 grid gap-4" noValidate>
        <ContactFields defaults={state.values ?? contact} errors={state.fieldErrors} idPrefix="bc" />
        <div className="flex flex-wrap items-center gap-4">
          <button className="btn btn-dark btn-sm" disabled={pending}>{pending ? "Lagrer …" : "Lagre kontakt"}</button>
          {state.ok && <p role="status" className="text-sm font-semibold text-ok">Kontakten er lagret.</p>}
          {state.error && !state.fieldErrors && <p role="alert" className="field-error !mt-0">{state.error}</p>}
        </div>
      </form>
    </section>
  );
}
