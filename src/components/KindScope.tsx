"use client";

import { createContext, useContext, useState } from "react";
import { SERVICES, type ServiceKind } from "@/lib/service";

const Ctx = createContext<{ active: ServiceKind; select: (k: ServiceKind) => void } | null>(null);

/**
 * Omslag rundt kundesiden når kunden har både foto- og filmpakker. Valgt fane ligger i `data-active-kind`, og CSS skjuler det som
 * hører til den andre tjenesten (bare på skjerm: utskrift og PDF viser begge). Siden rendres på serveren med riktig fane fra start.
 */
export function KindScope({ initial, children }: { initial: ServiceKind; children: React.ReactNode }) {
  const [active, setActive] = useState<ServiceKind>(initial);
  const select = (k: ServiceKind) => {
    setActive(k);
    // Holder adressen delbar: ?tjeneste=film åpner filmfanen
    const url = new URL(window.location.href);
    url.searchParams.set("tjeneste", SERVICES[k].slug);
    window.history.replaceState(null, "", url);
  };
  return (
    <Ctx.Provider value={{ active, select }}>
      <div className="kind-scope" data-active-kind={active}>{children}</div>
    </Ctx.Provider>
  );
}

/** Fanene Eventfoto | Eventfilm. Må ligge inni KindScope. */
export function KindTabs({ kinds }: { kinds: ServiceKind[] }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <div role="group" aria-label="Velg tjeneste" className="no-print mt-6 flex flex-wrap gap-2">
      {kinds.map((k) => (
        <button key={k} type="button" className="tab" aria-pressed={ctx.active === k} data-testid={`tab-${SERVICES[k].slug}`} onClick={() => ctx.select(k)}>
          {SERVICES[k].label}
        </button>
      ))}
    </div>
  );
}
