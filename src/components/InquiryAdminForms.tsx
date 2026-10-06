"use client";

import { useActionState } from "react";
import { STATUS_LABELS, STATUSES } from "@/lib/inquiry";
import { deleteByEmailAction, deleteInquiryAction, setupHubspotAction, updateInquiryAction, type ActionState } from "@/app/admin/actions";

export function StatusForm({ id, status, notes }: { id: string; status: string; notes: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateInquiryAction.bind(null, id), {});
  return (
    <form action={action} className="grid gap-5">
      <div>
        <label htmlFor="status" className="field-label">Oppfølgingsstatus</label>
        <select id="status" name="status" defaultValue={status} className="input !w-auto">
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <p className="field-hint">Intern status. Kunden får ingen e-post når den endres, og den er ikke en bookingbekreftelse.</p>
      </div>
      <div>
        <label htmlFor="notes" className="field-label">Interne notater</label>
        <textarea id="notes" name="notes" defaultValue={notes} maxLength={10000} className="input" />
      </div>
      <div className="flex items-center gap-4">
        <button className="btn btn-dark btn-sm" disabled={pending}>{pending ? "Lagrer …" : "Lagre"}</button>
        {state.ok && <p role="status" className="text-sm font-semibold text-ok">Lagret.</p>}
        {state.error && <p role="alert" className="field-error !mt-0">{state.error}</p>}
      </div>
    </form>
  );
}

export function DeleteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteInquiryAction.bind(null, id), {});
  return (
    <form action={action} className="grid gap-3">
      <label className="check text-sm">
        <input type="checkbox" name="confirm" />
        <span>Jeg bekrefter at forespørselen og tilhørende e-postjobber skal slettes for godt.</span>
      </label>
      {state.error && <p role="alert" className="field-error !mt-0">{state.error}</p>}
      <button className="btn btn-outline btn-sm self-start !border-err !text-err hover:!bg-err hover:!text-white" disabled={pending}>Slett forespørsel</button>
    </form>
  );
}

/** Sletter alt fra én kontaktadresse, for eksempel når noen ber om at opplysningene deres slettes. */
export function DeleteByEmailForm({ crmEnabled = false }: { crmEnabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteByEmailAction, {});
  return (
    <form action={action} className="grid gap-4 max-w-xl">
      <div>
        <label htmlFor="del-email" className="field-label">E-postadresse</label>
        <input id="del-email" name="email" type="email" className="input" defaultValue={state.values?.email ?? ""} autoComplete="off" aria-describedby="del-email-h" />
        <p id="del-email-h" className="field-hint">Sletter alle forespørsler som er sendt inn med denne kontaktadressen (uavhengig av store/små bokstaver), med tilhørende e-postjobber. Kan ikke angres.</p>
      </div>
      <label className="check text-sm">
        <input type="checkbox" name="confirm" />
        <span>Jeg bekrefter at alt fra denne adressen skal slettes for godt.</span>
      </label>
      {crmEnabled && (
        <label className="check text-sm">
          <input type="checkbox" name="deleteContact" />
          <span>Slett også kontakten i HubSpot (permanent). La stå av hvis personen er en vanlig kunde som skal beholdes der. Tilknyttede dealer arkiveres uansett.</span>
        </label>
      )}
      {state.error && <p role="alert" className="field-error !mt-0">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm font-semibold text-ok">{state.message}</p>}
      <button className="btn btn-outline btn-sm self-start !border-err !text-err hover:!bg-err hover:!text-white" disabled={pending}>Slett alt fra adressen</button>
    </form>
  );
}

/** Oppretter egenskapene dealene trenger i HubSpot (én gang etter at tokenet er satt). */
export function HubspotSetupForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => setupHubspotAction(), {});
  return (
    <form action={action} className="grid gap-3">
      {state.error && <p role="alert" className="field-error !mt-0">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm font-semibold text-ok">{state.message}</p>}
      <button className="btn btn-dark btn-sm self-start" disabled={pending}>{pending ? "Setter opp …" : "Sett opp HubSpot"}</button>
    </form>
  );
}
