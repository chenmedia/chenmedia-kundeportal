"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createCustomerAction, type ActionState } from "../../actions";

export default function NewCustomer() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCustomerAction, {});
  return (
    <div className="max-w-xl">
      <Link href="/admin" className="link text-sm">← Til kundene</Link>
      <h1 className="display text-3xl mt-3">Opprett kunde</h1>
      <p className="mt-2 text-muted">Kunden får et upublisert utkast. Ingenting vises på kundelenken før du publiserer.</p>
      <form action={action} className="card p-6 mt-6 grid gap-5">
        <div>
          <label htmlFor="name" className="field-label">Kundenavn</label>
          <input id="name" name="name" required minLength={2} maxLength={100} className="input" aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "err" : undefined} />
          {state.error && <p id="err" className="field-error">{state.error}</p>}
        </div>
        <button className="btn btn-dark self-start" disabled={pending}>{pending ? "Oppretter …" : "Opprett kunde"}</button>
      </form>
    </div>
  );
}
