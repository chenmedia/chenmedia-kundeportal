"use client";

import { useActionState } from "react";
import { STATUS_LABELS, STATUSES } from "@/lib/content";
import { deleteInquiryAction, updateInquiryAction, type ActionState } from "@/app/admin/actions";

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
