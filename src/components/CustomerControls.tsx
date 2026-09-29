"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishAction, rotateTokenAction, setActiveAction, duplicateAction, type ActionState } from "@/app/admin/actions";

interface Props {
  customerId: string;
  link: string | null;
  active: boolean;
  published: boolean;
  differs: boolean;
  versionNumber: number | null;
}

export function CustomerControls({ customerId, link, active, published, differs, versionNumber }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState("");

  function run(fn: () => Promise<ActionState>, okMsg: string) {
    setMsg(""); setResult(null);
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) { setMsg(okMsg); router.refresh(); }
    });
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setMsg("Kunne ikke kopiere automatisk. Marker lenken og kopier manuelt."); }
  }

  return (
    <aside className="grid gap-5 lg:sticky lg:top-6" aria-label="Publisering og tilgang">
      <section className="card p-5 grid gap-3">
        <h2 className="title text-lg">Publisering</h2>
        <p className="text-sm">
          {!published ? "Utkastet er ikke publisert." : differs ? "Utkastet avviker fra den publiserte versjonen." : `Utkastet er likt aktiv versjon v${versionNumber}.`}
        </p>
        <p className="text-sm text-muted">Husk å trykke «Lagre utkast» først. Publisering bruker det lagrede utkastet.</p>
        <Link className="btn btn-outline btn-sm" href={`/admin/kunder/${customerId}/forhandsvisning`} target="_blank">Forhåndsvis utkast</Link>
        <button className="btn btn-accent" disabled={pending} onClick={() => {
          if (!confirm("Publisere utkastet? Det oppdaterer kundens aktive lenke.")) return;
          run(() => publishAction(customerId), "Publisert. Kundelenken viser nå den nye versjonen.");
        }}>{pending ? "Jobber …" : "Publiser"}</button>
        {result?.error && (
          <div role="alert" className="text-sm text-err font-semibold">
            <p>{result.error}</p>
            {result.problems && <ul className="list-disc pl-5 mt-1">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
        {msg && <p role="status" className="text-sm font-semibold text-ok">{msg}</p>}
        <Link className="link text-sm" href={`/admin/kunder/${customerId}/versjoner`}>Versjonshistorikk</Link>
      </section>

      <section className="card p-5 grid gap-3">
        <h2 className="title text-lg">Kundelenke</h2>
        {link ? (
          <>
            <label htmlFor="cl" className="sr-only">Kundelenke</label>
            <input id="cl" readOnly value={link} className="input !text-[13px]" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-dark btn-sm" onClick={copy}>{copied ? "Kopiert" : "Kopier lenke"}</button>
            <span role="status" className="sr-only">{copied ? "Lenken er kopiert" : ""}</span>
          </>
        ) : <p className="text-sm text-err">Lenken kan ikke vises (sjekk APP_SECRET). Generer ny lenke.</p>}
        <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => {
          if (!confirm("Generere ny lenke? Den gamle lenken slutter å virke med en gang.")) return;
          run(() => rotateTokenAction(customerId), "Ny lenke er generert. Den gamle lenken virker ikke lenger.");
        }}>Generer ny lenke</button>
        <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => {
          if (active && !confirm("Deaktivere siden? Kunden ser en nøytral melding. Ingenting slettes.")) return;
          run(() => setActiveAction(customerId, !active), active ? "Siden er deaktivert." : "Siden er aktivert.");
        }}>{active ? "Deaktiver side" : "Aktiver side"}</button>
      </section>

      <section className="card p-5">
        <h2 className="title text-lg mb-2">Dupliser</h2>
        <p className="text-sm text-muted mb-3">Kopierer innhold og pakker til en ny kunde med ny lenke. Forespørsler og historikk kopieres ikke.</p>
        <form action={duplicateAction.bind(null, customerId)}><button className="btn btn-outline btn-sm">Dupliser kunde</button></form>
      </section>
    </aside>
  );
}
