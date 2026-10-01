"use client";

import { PrintIcon } from "./Icons";

/** Lar kunden skrive ut eller lagre prislisten som PDF (utskriftsstilen skjuler knapper og dialog). */
export function PrintButton() {
  return (
    <button type="button" className="link font-semibold inline-flex items-center gap-2 min-h-[44px] no-print" onClick={() => window.print()}>
      <PrintIcon className="h-4 w-4" /> Skriv ut eller lagre som PDF
    </button>
  );
}
