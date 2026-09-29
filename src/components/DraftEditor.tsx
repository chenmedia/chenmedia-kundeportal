"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AddonContent, Content, MAX_PACKAGES, PackageContent, addonBasis, addonBasisLabels, newId, DEFAULT_CTA,
} from "@/lib/content";
import { saveDraftAction } from "@/app/admin/actions";

interface Asset { id: string; name: string; width: number; height: number }

function PriceInput({ id, valueOre, onChange, label }: { id: string; valueOre: number | null; onChange: (ore: number | null) => void; label: string }) {
  const [text, setText] = useState(valueOre === null ? "" : String(valueOre / 100).replace(".", ","));
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input id={id} inputMode="decimal" className="input" value={text} placeholder="0" onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = Number(t.replace(/\s/g, "").replace(",", "."));
        onChange(t.trim() === "" || Number.isNaN(n) || n < 0 ? null : Math.round(n * 100));
      }} />
    </div>
  );
}

function Text({ id, label, value, onChange, max, hint, area }: { id: string; label: string; value: string; onChange: (v: string) => void; max?: number; hint?: string; area?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {area
        ? <textarea id={id} className="input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-h` : undefined} />
        : <input id={id} className="input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-h` : undefined} />}
      {hint && <p id={`${id}-h`} className="field-hint">{hint}</p>}
    </div>
  );
}

function Section({ id, title, children, intro }: { id: string; title: string; children: React.ReactNode; intro?: string }) {
  return (
    <section aria-labelledby={id} className="card p-6 grid gap-5">
      <div>
        <h2 id={id} className="title text-xl">{title}</h2>
        {intro && <p className="text-sm text-muted mt-1">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

function RowButtons({ i, len, onMove, onRemove, what }: { i: number; len: number; onMove: (d: -1 | 1) => void; onRemove: () => void; what: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-outline btn-sm" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Flytt ${what} opp`}>↑ Opp</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={i === len - 1} onClick={() => onMove(1)} aria-label={`Flytt ${what} ned`}>↓ Ned</button>
      <button type="button" className="btn btn-outline btn-sm !border-err !text-err hover:!bg-err hover:!text-white" onClick={onRemove} aria-label={`Fjern ${what}`}>Fjern</button>
    </div>
  );
}

export function DraftEditor(props: {
  customerId: string;
  initialName: string;
  needsRename: boolean;
  initialContent: Content;
  assets: Asset[];
}) {
  const [name, setName] = useState(props.initialName);
  const [c, setC] = useState<Content>(props.initialContent);
  const [assets, setAssets] = useState<Asset[]>(props.assets);
  const saved = useRef(JSON.stringify([props.initialName, props.initialContent]));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [uploadErr, setUploadErr] = useState("");
  const [uploading, setUploading] = useState(false);

  const snapshot = useMemo(() => JSON.stringify([name, c]), [name, c]);
  useEffect(() => { setDirty(snapshot !== saved.current); }, [snapshot]);

  // Advar ved ulagrede endringer: lukking/reload og klikk på interne lenker.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.getAttribute("href")?.startsWith("#")) return;
      if (!confirm("Du har ulagrede endringer. Forlate siden uten å lagre?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);

  const patch = useCallback((p: Partial<Content>) => setC((x) => ({ ...x, ...p })), []);
  const patchPkg = (i: number, p: Partial<PackageContent>) => setC((x) => ({ ...x, packages: x.packages.map((k, n) => (n === i ? { ...k, ...p } : k)) }));
  const patchAddon = (i: number, p: Partial<AddonContent>) => setC((x) => ({ ...x, addons: x.addons.map((k, n) => (n === i ? { ...k, ...p } : k)) }));

  async function save() {
    setSaving(true); setStatus(null);
    try {
      const r = await saveDraftAction(props.customerId, name, JSON.stringify(c));
      if (r.ok) { saved.current = snapshot; setDirty(false); setStatus({ kind: "ok", text: "Utkastet er lagret." }); }
      else setStatus({ kind: "err", text: r.error ?? "Kunne ikke lagre. Prøv igjen." });
    } catch {
      setStatus({ kind: "err", text: "Kunne ikke lagre (mistet forbindelsen?). Endringene dine er fortsatt her. Prøv igjen." });
    } finally { setSaving(false); }
  }

  async function upload(file: File) {
    setUploading(true); setUploadErr("");
    const fd = new FormData();
    fd.set("file", file); fd.set("customerId", props.customerId);
    try {
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json();
      if (d.ok) {
        setAssets((a) => [{ id: d.id, name: file.name, width: 0, height: 0 }, ...a]);
        patch({ heroImageId: d.id });
      } else setUploadErr(d.error ?? "Opplastingen feilet.");
    } catch { setUploadErr("Opplastingen feilet. Prøv igjen."); }
    finally { setUploading(false); }
  }

  return (
    <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {/* Lagrelinje */}
      <div className="card p-4 flex flex-wrap items-center gap-4 sticky top-2 z-20 shadow-sm">
        <button type="submit" className="btn btn-dark" disabled={saving}>{saving ? "Lagrer …" : "Lagre utkast"}</button>
        <p role="status" className="text-sm font-semibold">
          {status?.kind === "ok" && !dirty && <span className="text-ok">{status.text}</span>}
          {status?.kind === "err" && <span className="text-err">{status.text}</span>}
          {dirty && !status && <span><span className="status-dot" aria-hidden="true" />Ulagrede endringer</span>}
          {dirty && status?.kind === "ok" && <span><span className="status-dot" aria-hidden="true" />Ulagrede endringer</span>}
        </p>
      </div>

      <Section id="s-kunde" title="Kunde og introduksjon">
        <div>
          <label htmlFor="cust-name" className="field-label">Kundenavn</label>
          <input id="cust-name" className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} aria-describedby={props.needsRename ? "rename-h" : undefined} />
          {props.needsRename && name === props.initialName && (
            <p id="rename-h" className="field-error">Dette er en duplisert kunde. Gi den et nytt navn før første publisering.</p>
          )}
        </div>
        <Text id="intro-title" label="Tittel (valgfritt)" value={c.introTitle} max={150} onChange={(v) => patch({ introTitle: v })} hint={`La stå tom for standardtittelen «Eventfotografering for ${name || "[kunde]"}».`} />
        <Text id="intro-text" label="Introduksjonstekst" area value={c.introText} max={800} onChange={(v) => patch({ introText: v })} />
        <Text id="cta" label="Tekst på hovedknappen" value={c.ctaLabel} max={60} onChange={(v) => patch({ ctaLabel: v })} hint={`Standard: «${DEFAULT_CTA}».`} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Text id="agr" label="Avtaleetikett" value={c.agreementLabel} max={60} onChange={(v) => patch({ agreementLabel: v })} hint="Eksempel: «Prisliste V2026». Påkrevd for publisering." />
          <Text id="valid" label="Gyldighetstekst (valgfritt)" value={c.validityText} max={200} onChange={(v) => patch({ validityText: v })} hint="Vises bare hvis avtalt startdato faktisk er registrert her." />
        </div>
      </Section>

      <Section id="s-bilder" title="Bilder" intro="Ett eventbilde øverst på siden. JPEG, PNG eller WebP, maks 10 MB. Uten bilde vises en pen plassholder.">
        <div>
          <label htmlFor="upload" className="field-label">Last opp bilde</label>
          <input id="upload" type="file" accept="image/jpeg,image/png,image/webp" className="input !py-2" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          {uploading && <p role="status" className="field-hint">Laster opp …</p>}
          {uploadErr && <p role="alert" className="field-error">{uploadErr}</p>}
        </div>
        <div>
          <label htmlFor="hero" className="field-label">Eventbilde på kundesiden</label>
          <select id="hero" className="input" value={c.heroImageId ?? ""} onChange={(e) => patch({ heroImageId: e.target.value || null })}>
            <option value="">Ingen (plassholder)</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {c.heroImageId && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/admin/media/${c.heroImageId}`} alt="Valgt eventbilde" className="rounded-2xl border border-line max-h-56 w-auto" />
            <Text id="hero-alt" label="Alternativtekst" value={c.heroImageAlt} max={200} onChange={(v) => patch({ heroImageAlt: v })} hint="Beskriv hva bildet viser, for skjermlesere." />
          </>
        )}
      </Section>

      <Section id="s-pakker" title={`Pakker (${c.packages.length}/${MAX_PACKAGES})`} intro="Priser oppgis i kroner eks. mva. Feltene for tid, bilder, bruksrett og levering fylles bare ut hvis det er avtalt.">
        {c.packages.length === 0 && <p className="text-muted">Ingen pakker ennå.</p>}
        {c.packages.map((p, i) => (
          <fieldset key={p.id} className="border border-line rounded-2xl p-5 grid gap-4">
            <legend className="title px-2">Pakke {i + 1}{p.name ? `: ${p.name}` : ""}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Text id={`p${i}-name`} label="Pakkenavn" value={p.name} max={80} onChange={(v) => patchPkg(i, { name: v })} />
              <PriceInput id={`p${i}-price`} label="Pris (kr, eks. mva.)" valueOre={p.priceOre} onChange={(o) => patchPkg(i, { priceOre: o })} />
              <div>
                <label htmlFor={`p${i}-type`} className="field-label">Pristype</label>
                <select id={`p${i}-type`} className="input" value={p.priceType} onChange={(e) => patchPkg(i, { priceType: e.target.value as "fixed" | "from" })}>
                  <option value="fixed">Fastpris</option>
                  <option value="from">Fra-pris</option>
                </select>
              </div>
              <label className="check text-sm self-end pb-3">
                <input type="checkbox" checked={p.custom} onChange={(e) => patchPkg(i, { custom: e.target.checked })} />
                <span>Skreddersydd pakke (knapp: «Beskriv behovet ditt»)</span>
              </label>
            </div>
            <Text id={`p${i}-note`} label="Forklaring til pris" value={p.priceNote} max={300} onChange={(v) => patchPkg(i, { priceNote: v })} hint="Påkrevd for fra-pris hvis beskrivelse mangler." />
            <Text id={`p${i}-desc`} label="Kort beskrivelse" area value={p.description} max={500} onChange={(v) => patchPkg(i, { description: v })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Text id={`p${i}-cov`} label="Dekningstid" value={p.coverage} max={120} onChange={(v) => patchPkg(i, { coverage: v })} hint="F.eks. «Inntil 2 timer fotografering»" />
              <Text id={`p${i}-img`} label="Bildeantall" value={p.images} max={120} onChange={(v) => patchPkg(i, { images: v })} hint="F.eks. «Inntil 20 høyoppløselige ferdig redigerte bilder»" />
              <Text id={`p${i}-use`} label="Bruksrett" value={p.usage} max={120} onChange={(v) => patchPkg(i, { usage: v })} />
              <Text id={`p${i}-del`} label="Levering" value={p.delivery} max={120} onChange={(v) => patchPkg(i, { delivery: v })} />
            </div>
            <RowButtons i={i} len={c.packages.length} what={`pakke ${i + 1}`}
              onMove={(d) => patch({ packages: move(c.packages, i, d) })}
              onRemove={() => { if (confirm(`Fjerne «${p.name || `pakke ${i + 1}`}» fra utkastet?`)) patch({ packages: c.packages.filter((_, n) => n !== i) }); }} />
          </fieldset>
        ))}
        <button type="button" className="btn btn-outline btn-sm self-start" disabled={c.packages.length >= MAX_PACKAGES}
          onClick={() => patch({ packages: [...c.packages, { id: newId("pkg"), name: "", priceType: "fixed", priceOre: null, priceNote: "", description: "", coverage: "", images: "", usage: "", delivery: "", custom: false }] })}>
          + Legg til pakke
        </button>
        {c.packages.length >= MAX_PACKAGES && <p className="field-hint">Maks {MAX_PACKAGES} pakker per kundeside.</p>}
      </Section>

      <Section id="s-tillegg" title="Tillegg">
        {c.addons.length === 0 && <p className="text-muted">Ingen tillegg.</p>}
        {c.addons.map((a, i) => (
          <fieldset key={a.id} className="border border-line rounded-2xl p-5 grid gap-4">
            <legend className="title px-2">Tillegg {i + 1}{a.name ? `: ${a.name}` : ""}</legend>
            <Text id={`a${i}-name`} label="Navn" value={a.name} max={120} onChange={(v) => patchAddon(i, { name: v })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`a${i}-basis`} className="field-label">Prisgrunnlag</label>
                <select id={`a${i}-basis`} className="input" value={a.basis} onChange={(e) => patchAddon(i, { basis: e.target.value as AddonContent["basis"] })}>
                  {addonBasis.map((b) => <option key={b} value={b}>{addonBasisLabels[b]}</option>)}
                </select>
              </div>
              {a.basis === "percent" ? (
                <div>
                  <label htmlFor={`a${i}-pct`} className="field-label">Prosent</label>
                  <input id={`a${i}-pct`} inputMode="decimal" className="input" defaultValue={a.percent ?? ""} onChange={(e) => {
                    const n = Number(e.target.value.replace(",", "."));
                    patchAddon(i, { percent: e.target.value.trim() === "" || Number.isNaN(n) || n < 0 ? null : n });
                  }} />
                </div>
              ) : (
                <PriceInput id={`a${i}-amt`} label="Beløp (kr, eks. mva.)" valueOre={a.amountOre} onChange={(o) => patchAddon(i, { amountOre: o })} />
              )}
            </div>
            <Text id={`a${i}-note`} label="Merknad (valgfritt)" value={a.note} max={300} onChange={(v) => patchAddon(i, { note: v })} />
            <RowButtons i={i} len={c.addons.length} what={`tillegg ${i + 1}`}
              onMove={(d) => patch({ addons: move(c.addons, i, d) })}
              onRemove={() => patch({ addons: c.addons.filter((_, n) => n !== i) })} />
          </fieldset>
        ))}
        <button type="button" className="btn btn-outline btn-sm self-start"
          onClick={() => patch({ addons: [...c.addons, { id: newId("add"), name: "", basis: "one_time", amountOre: null, percent: null, note: "" }] })}>
          + Legg til tillegg
        </button>
      </Section>

      <Section id="s-vilkar" title="Praktiske vilkår" intro="Ett vilkår per linje, f.eks. «Betalingsfrist: 30 dager.»">
        {c.practical.map((t, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label htmlFor={`t${i}`} className="field-label">Vilkår {i + 1}</label>
              <input id={`t${i}`} className="input" value={t} maxLength={300} onChange={(e) => patch({ practical: c.practical.map((x, n) => (n === i ? e.target.value : x)) })} />
            </div>
            <RowButtons i={i} len={c.practical.length} what={`vilkår ${i + 1}`}
              onMove={(d) => patch({ practical: move(c.practical, i, d) })}
              onRemove={() => patch({ practical: c.practical.filter((_, n) => n !== i) })} />
          </div>
        ))}
        <button type="button" className="btn btn-outline btn-sm self-start" onClick={() => patch({ practical: [...c.practical, ""] })}>+ Legg til vilkår</button>
      </Section>

      <Section id="s-kontakt" title="Kontakt" intro="Vises nederst på kundesiden. Påkrevd e-post brukes også som varseladresse hvis NOTIFY_EMAIL ikke er satt.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Text id="ct-name" label="Kontaktperson" value={c.contactName} max={100} onChange={(v) => patch({ contactName: v })} />
          <Text id="ct-mail" label="Kontakt-e-post" value={c.contactEmail} max={200} onChange={(v) => patch({ contactEmail: v })} />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-dark" disabled={saving}>{saving ? "Lagrer …" : "Lagre utkast"}</button>
        {status && <p role="status" className={`text-sm font-semibold ${status.kind === "ok" ? "text-ok" : "text-err"}`}>{status.text}</p>}
      </div>
    </form>
  );
}
