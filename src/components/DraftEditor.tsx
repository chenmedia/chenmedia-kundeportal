"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddonContent, Content, DEFAULT_CTA, DEFAULT_GALLERY_TITLE, MAX_GALLERY, MAX_PACKAGES, PackageContent, addonBasis, addonBasisLabels, newId } from "@/lib/content";
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

/** Velger blant kundens opplastede bilder, med miniatyr av valgt bilde. */
function ImageSelect({ id, label, value, assets, onChange, noneLabel }: { id: string; label: string; value: string | null; assets: Asset[]; onChange: (v: string | null) => void; noneLabel: string }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="flex items-center gap-3">
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/admin/media/${value}`} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-lg border border-line object-cover" />
        )}
        <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{noneLabel}</option>
          {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
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

  /** Laster opp én fil. Returnerer ID-en ved suksess. */
  async function uploadOne(file: File): Promise<string | null> {
    if (file.size > 10 * 1024 * 1024) { setUploadErr(`${file.name}: filen er større enn 10 MB.`); return null; }
    const prep = await (await fetch("/api/admin/media/prepare", { method: "POST" })).json();
    if (!prep.ok) { setUploadErr(prep.error ?? "Opplastingen feilet."); return null; }
    // Lokalt: rå PUT til egen rute. Drift: signert opplasting rett til Supabase Storage.
    let put: Response;
    if (prep.kind === "local") {
      put = await fetch(prep.uploadUrl, { method: "PUT", body: file });
    } else {
      const fd = new FormData();
      fd.set("cacheControl", "3600");
      fd.set("", file);
      put = await fetch(prep.uploadUrl, { method: "PUT", body: fd });
    }
    if (!put.ok) { setUploadErr("Opplastingen feilet. Prøv igjen."); return null; }
    const done = await (await fetch("/api/admin/media/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: props.customerId, key: prep.key, filename: file.name }),
    })).json();
    if (!done.ok) { setUploadErr(done.error ?? "Opplastingen feilet."); return null; }
    return done.id as string;
  }

  /** Flere filer om gangen. Bildene havner i biblioteket; første bilde blir eventbilde hvis det ikke er satt. */
  async function upload(files: File[]) {
    setUploading(true); setUploadErr("");
    try {
      for (const file of files) {
        const id = await uploadOne(file);
        if (!id) continue;
        setAssets((a) => [{ id, name: file.name, width: 0, height: 0 }, ...a]);
        setC((x) => (x.heroImageId ? x : { ...x, heroImageId: id }));
      }
    } catch { setUploadErr("Opplastingen feilet. Prøv igjen."); }
    finally { setUploading(false); }
  }

  const patchGallery = (i: number, p: Partial<Content["gallery"][number]>) =>
    setC((x) => ({ ...x, gallery: x.gallery.map((g, n) => (n === i ? { ...g, ...p } : g)) }));

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

      <Section id="s-bilder" title="Bilder" intro="Last opp bilder til biblioteket og velg hvor de skal brukes: ett eventbilde øverst, et galleri mellom pakker og tillegg, og eventuelt ett bilde per pakke. JPEG, PNG eller WebP, maks 10 MB per bilde. Uten bilder vises en pen plassholder.">
        <div>
          <label htmlFor="upload" className="field-label">Last opp bilde</label>
          <input id="upload" type="file" multiple accept="image/*" className="input !py-2" disabled={uploading}
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) void upload(f); e.target.value = ""; }} />
          <p className="field-hint">Du kan velge flere bilder samtidig.</p>
          {uploading && <p role="status" className="field-hint">Laster opp …</p>}
          {uploadErr && <p role="alert" className="field-error">{uploadErr}</p>}
        </div>
        {assets.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6" aria-label="Bildebibliotek">
            {assets.map((a) => (
              <li key={a.id} className="min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/admin/media/${a.id}`} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
                <p className="mt-1 truncate text-xs text-muted" title={a.name}>{a.name}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 border-t border-line pt-5">
          <h3 className="title">Eventbilde øverst</h3>
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
        </div>

        <div className="grid gap-4 border-t border-line pt-5">
          <div>
            <h3 className="title">Galleri ({c.gallery.length}/{MAX_GALLERY})</h3>
            <p className="text-sm text-muted mt-1">Vises mellom pakkene og tilleggene. Oppsettet tilpasses antall bilder: ett bilde blir en bred banner, tre og fem gir ett stort bilde med mindre ved siden av, ellers et rutenett.</p>
          </div>
          {c.gallery.length > 0 && (
            <Text id="gal-title" label="Overskrift (valgfritt)" value={c.galleryTitle} max={80} onChange={(v) => patch({ galleryTitle: v })} hint={`Standard: «${DEFAULT_GALLERY_TITLE}».`} />
          )}
          {c.gallery.map((g, i) => (
            <fieldset key={g.id} className="border border-line rounded-2xl p-4 grid gap-3">
              <legend className="title px-2">Galleribilde {i + 1}</legend>
              <ImageSelect id={`g${i}-img`} label="Bilde" value={g.imageId} assets={assets} noneLabel="Velg bilde" onChange={(v) => v && patchGallery(i, { imageId: v })} />
              <Text id={`g${i}-alt`} label="Beskrivelse av bildet" value={g.alt} max={200} onChange={(v) => patchGallery(i, { alt: v })} hint="For skjermlesere. La stå tom hvis bildet bare er pynt." />
              <RowButtons i={i} len={c.gallery.length} what={`galleribilde ${i + 1}`}
                onMove={(d) => patch({ gallery: move(c.gallery, i, d) })}
                onRemove={() => patch({ gallery: c.gallery.filter((_, n) => n !== i) })} />
            </fieldset>
          ))}
          <button type="button" className="btn btn-outline btn-sm self-start" disabled={c.gallery.length >= MAX_GALLERY || assets.length === 0}
            onClick={() => patch({ gallery: [...c.gallery, { id: newId("gal"), imageId: assets[0].id, alt: "" }] })}>
            + Legg til galleribilde
          </button>
          {assets.length === 0 && <p className="field-hint">Last opp bilder først.</p>}
        </div>
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
              <ImageSelect id={`p${i}-photo`} label="Bilde på pakkekortet (valgfritt)" value={p.imageId} assets={assets} noneLabel="Ingen" onChange={(v) => patchPkg(i, { imageId: v })} />
              {p.imageId && <Text id={`p${i}-photo-alt`} label="Beskrivelse av pakkebildet" value={p.imageAlt} max={200} onChange={(v) => patchPkg(i, { imageAlt: v })} hint="For skjermlesere. La stå tom hvis bildet bare er pynt." />}
            </div>
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
          onClick={() => patch({ packages: [...c.packages, { id: newId("pkg"), name: "", priceType: "fixed", priceOre: null, priceNote: "", description: "", coverage: "", images: "", usage: "", delivery: "", custom: false, imageId: null, imageAlt: "" }] })}>
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

      <Section id="s-kontakt" title="Kontakt på kundesiden (Chen Media)" intro="Din kontaktperson som vises nederst på kundesiden. Påkrevd e-post brukes også som varseladresse hvis NOTIFY_EMAIL ikke er satt. Ikke å forveksle med «Kontakt hos bedriften» øverst.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Text id="ct-name" label="Kontaktperson hos Chen Media" value={c.contactName} max={100} onChange={(v) => patch({ contactName: v })} />
          <Text id="ct-mail" label="Chen Medias e-post" value={c.contactEmail} max={200} onChange={(v) => patch({ contactEmail: v })} />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-dark" disabled={saving}>{saving ? "Lagrer …" : "Lagre utkast"}</button>
        {status && <p role="status" className={`text-sm font-semibold ${status.kind === "ok" ? "text-ok" : "text-err"}`}>{status.text}</p>}
      </div>
    </form>
  );
}
