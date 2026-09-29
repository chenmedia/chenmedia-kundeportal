"use client";

import { useCallback, useEffect, useRef } from "react";
import { OPEN_EVENT } from "./form-events";
import { CloseIcon } from "./Icons";

/**
 * Skjemaet ligger bak knapper og åpnes i en tilgjengelig dialog (native <dialog>: fokusfelle, Esc lukker).
 * Innholdet forblir montert når dialogen lukkes, så innskrevet tekst beholdes.
 */
export function RequestDialog({ children, customerName }: { children: React.ReactNode; customerName: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  const open = useCallback(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    document.documentElement.classList.add("modal-open");
    requestAnimationFrame(() => document.getElementById("foresporsel-heading")?.focus());
  }, []);

  useEffect(() => {
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => document.documentElement.classList.remove("modal-open");
    d.addEventListener("close", onClose);
    return () => { d.removeEventListener("close", onClose); onClose(); };
  }, []);

  return (
    <dialog
      ref={ref}
      className="request-dialog"
      aria-labelledby="foresporsel-heading"
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}
    >
      <div className="request-dialog__panel">
        <div className="request-dialog__bar">
          <p className="eyebrow">Forespørsel · {customerName}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => ref.current?.close()} aria-label="Lukk skjema">
            <CloseIcon /> Lukk
          </button>
        </div>
        <div className="request-dialog__body">{children}</div>
      </div>
    </dialog>
  );
}
