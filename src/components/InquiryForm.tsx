"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCalendarDate, todayInOslo } from "@/lib/format";
import { inquiryInputSchema, OTHER_PACKAGE } from "@/lib/inquiry";
import { SELECT_EVENT } from "./form-events";

interface Props {
  token?: string;
  versionId: string;
  packages: { id: string; name: string; custom: boolean }[];
  disabledReason?: string;
  emailConfigured: boolean;
  contactEmail: string;
}

interface Values {
  packageId: string;
  eventName: string;
  dateUnknown: boolean;
  eventDate: string;
  locationUnknown: boolean;
  location: string;
  timeframe: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  express: boolean;
  printUse: boolean;
}

const INITIAL: Values = {
  packageId: "", eventName: "", dateUnknown: false, eventDate: "", locationUnknown: false, location: "",
  timeframe: "", description: "", contactName: "", contactEmail: "", contactPhone: "", express: false, printUse: false,
};

type Errors = Partial<Record<keyof Values, string>>;
interface Receipt { reference: string; packageName: string; eventName: string; eventDate: string | null }

function ErrorText({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} className="field-error">{msg}</p> : null;
}

export function InquiryForm(props: Props) {
  const router = useRouter();
  const disabled = !props.token || !!props.disabledReason;
  const [v, setV] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [stale, setStale] = useState(false);
  const [updated, setUpdated] = useState(false);
  const keyRef = useRef<string>("");
  const honeypot = useRef<HTMLInputElement>(null);
  const seenVersion = useRef(props.versionId);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => { keyRef.current = crypto.randomUUID(); }, []);

  // Pakkevalg fra kortene
  useEffect(() => {
    const h = (e: Event) => setV((p) => ({ ...p, packageId: (e as CustomEvent<string>).detail }));
    window.addEventListener(SELECT_EVENT, h);
    return () => window.removeEventListener(SELECT_EVENT, h);
  }, []);

  // Siden ble oppdatert (ny versjon) etter en 409: behold skjematekst, be kunden gjennomgå.
  useEffect(() => {
    if (props.versionId !== seenVersion.current) {
      seenVersion.current = props.versionId;
      setV((p) => (p.packageId && p.packageId !== OTHER_PACKAGE && !props.packages.some((x) => x.id === p.packageId) ? { ...p, packageId: "" } : p));
      if (stale) setUpdated(true);
    }
  }, [props.versionId, props.packages, stale]);

  const set = useCallback(<K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val })), []);

  const validate = (): Errors => {
    const r = inquiryInputSchema.safeParse(v);
    if (r.success) return {};
    const out: Errors = {};
    for (const i of r.error.issues) {
      const k = i.path[0] as keyof Values;
      if (!out[k]) out[k] = i.message;
    }
    return out;
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || disabled || stale) return;
    const errs = validate();
    setErrors(errs);
    setServerError(false);
    if (Object.keys(errs).length) {
      setTimeout(() => errorSummary.current?.focus(), 0);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/k/${props.token}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, idempotencyKey: keyRef.current, versionId: props.versionId, website: honeypot.current?.value ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setReceipt(data.receipt);
        keyRef.current = crypto.randomUUID();
        setTimeout(() => document.getElementById("foresporsel-heading")?.focus(), 0);
      } else if (res.status === 409) {
        setStale(true);
        setUpdated(false);
        router.refresh();
      } else if (res.status === 422 && data.fieldErrors) {
        setErrors(data.fieldErrors);
        setTimeout(() => errorSummary.current?.focus(), 0);
      } else {
        setServerError(true);
      }
    } catch {
      setServerError(true);
    } finally {
      setSending(false);
    }
  }

  if (receipt) {
    return (
      <div>
        <h2 id="foresporsel-heading" tabIndex={-1} className="display text-2xl md:text-3xl outline-none">Forespørsel mottatt</h2>
        <div role="status" className="mt-4">
          <p className="ingress text-[17px]">Takk! Vi har mottatt forespørselen din. Kai følger opp for å avklare tilgjengelighet og detaljer.</p>
          {props.emailConfigured && <p className="mt-2 text-sm text-muted">Vi sender også en kopi på e-post.</p>}
        </div>
        <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_1fr] text-[15px] border-t border-line pt-6">
          <dt className="eyebrow">Referanse</dt><dd className="mono-num">{receipt.reference}</dd>
          <dt className="eyebrow">Pakke</dt><dd>{receipt.packageName}</dd>
          <dt className="eyebrow">Arrangement</dt><dd>{receipt.eventName}</dd>
          <dt className="eyebrow">Dato</dt><dd>{receipt.eventDate ? formatCalendarDate(receipt.eventDate) : "Ikke avklart"}</dd>
        </dl>
        <p className="mt-6 text-sm text-muted">Dette er en forespørsel. Oppdraget er bekreftet først når du har fått bekreftelse fra Chen Media.</p>
      </div>
    );
  }

  const errKeys = Object.keys(errors) as (keyof Values)[];
  const today = todayInOslo();
  const inv = (k: keyof Values) => (errors[k] ? true : undefined);
  const desc = (k: keyof Values, hint?: string) => [errors[k] ? `err-${k}` : null, hint ? `hint-${k}` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={sending}>
      <h2 id="foresporsel-heading" tabIndex={-1} className="display text-2xl md:text-3xl outline-none">Send et fotobehov</h2>
      <p className="mt-2 text-muted">Det tar omtrent to minutter. Du trenger ikke oppgi bedrift, vi vet hvem du er. Lukker du skjemaet, beholdes teksten din.</p>

      {disabled && props.disabledReason && (
        <p role="note" className="mt-4 rounded-xl border-2 border-ink bg-cream px-4 py-3 text-sm font-semibold">{props.disabledReason}</p>
      )}

      {stale && (
        <div role="alert" className="mt-4 rounded-xl border-2 border-ink bg-cream px-4 py-3">
          {updated ? (
            <>
              <p className="font-semibold"><span className="status-dot" aria-hidden="true" />Prislisten er oppdatert mens du fylte ut skjemaet. Gå gjennom pakkene og prisene over, velg pakke på nytt om nødvendig, og bekreft før du sender. Teksten din er beholdt.</p>
              <button type="button" className="btn btn-dark btn-sm mt-3" onClick={() => setStale(false)}>
                Jeg har gått gjennom den oppdaterte prislisten
              </button>
            </>
          ) : (
            <p className="font-semibold"><span className="status-dot" aria-hidden="true" />Prislisten er oppdatert. Henter ny versjon …</p>
          )}
        </div>
      )}

      {errKeys.length > 0 && (
        <div ref={errorSummary} tabIndex={-1} role="alert" className="mt-4 rounded-xl border-2 border-err px-4 py-3 outline-none">
          <p className="font-bold text-err">Rett opp {errKeys.length === 1 ? "feltet" : "feltene"} under før du sender:</p>
          <ul className="list-disc pl-5 mt-1 text-sm">
            {errKeys.map((k) => <li key={k}><a className="link" href={`#f-${k}`}>{errors[k]}</a></li>)}
          </ul>
        </div>
      )}

      <fieldset disabled={disabled} className="mt-8 grid gap-6 md:grid-cols-2 min-w-0">
        <div className="md:col-span-2">
          <label htmlFor="f-packageId" className="field-label">Pakke</label>
          <select id="f-packageId" className="input" value={v.packageId} onChange={(e) => set("packageId", e.target.value)}
            aria-invalid={inv("packageId")} aria-describedby={desc("packageId")}>
            <option value="">Velg pakke …</option>
            {props.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={OTHER_PACKAGE}>Usikker / annet behov</option>
          </select>
          <ErrorText id="err-packageId" msg={errors.packageId} />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="f-eventName" className="field-label">Arrangementets navn eller type</label>
          <input id="f-eventName" className="input" value={v.eventName} maxLength={150} onChange={(e) => set("eventName", e.target.value)}
            aria-invalid={inv("eventName")} aria-describedby={desc("eventName")} autoComplete="off" />
          <ErrorText id="err-eventName" msg={errors.eventName} />
        </div>

        <div>
          <label htmlFor="f-eventDate" className="field-label">Dato</label>
          <input id="f-eventDate" type="date" className="input" min={today} value={v.eventDate} disabled={v.dateUnknown}
            onChange={(e) => set("eventDate", e.target.value)} aria-invalid={inv("eventDate")} aria-describedby={desc("eventDate")} />
          <label className="check mt-3 text-sm">
            <input type="checkbox" checked={v.dateUnknown} onChange={(e) => { set("dateUnknown", e.target.checked); if (e.target.checked) set("eventDate", ""); }} />
            <span>Dato er ikke avklart</span>
          </label>
          <ErrorText id="err-eventDate" msg={errors.eventDate} />
        </div>

        <div>
          <label htmlFor="f-location" className="field-label">Sted</label>
          <input id="f-location" className="input" value={v.location} maxLength={200} disabled={v.locationUnknown}
            onChange={(e) => set("location", e.target.value)} aria-invalid={inv("location")} aria-describedby={desc("location")} autoComplete="off" />
          <label className="check mt-3 text-sm">
            <input type="checkbox" checked={v.locationUnknown} onChange={(e) => { set("locationUnknown", e.target.checked); if (e.target.checked) set("location", ""); }} />
            <span>Sted er ikke avklart</span>
          </label>
          <ErrorText id="err-location" msg={errors.location} />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="f-timeframe" className="field-label">Ønsket tidsrom eller varighet <span className="font-normal text-muted">(valgfritt)</span></label>
          <input id="f-timeframe" className="input" value={v.timeframe} maxLength={150} onChange={(e) => set("timeframe", e.target.value)}
            aria-invalid={inv("timeframe")} aria-describedby={desc("timeframe", "Eksempel: 17:00–20:00, eller «ca. 3 timer»")} />
          <p id="hint-timeframe" className="field-hint">Eksempel: 17:00–20:00, eller «ca. 3 timer».</p>
          <ErrorText id="err-timeframe" msg={errors.timeframe} />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="f-description" className="field-label">Beskrivelse av behovet</label>
          <textarea id="f-description" className="input" value={v.description} maxLength={3000} onChange={(e) => set("description", e.target.value)}
            aria-invalid={inv("description")} aria-describedby={desc("description")} />
          <ErrorText id="err-description" msg={errors.description} />
        </div>

        <div className="md:col-span-2 grid gap-3">
          <label className="check text-[15px]">
            <input type="checkbox" checked={v.express} onChange={(e) => set("express", e.target.checked)} />
            <span>Ønsker levering innen 24 timer</span>
          </label>
          <label className="check text-[15px]">
            <input type="checkbox" checked={v.printUse} onChange={(e) => set("printUse", e.target.checked)} />
            <span>Ønsker å avklare bruk av bilder i trykk</span>
          </label>
          <p className="field-hint">Tillegg er ønsker som avklares i tilbudet. De er ikke bestilt før Chen Media har bekreftet.</p>
        </div>

        <div>
          <label htmlFor="f-contactName" className="field-label">Kontaktperson</label>
          <input id="f-contactName" className="input" value={v.contactName} maxLength={100} onChange={(e) => set("contactName", e.target.value)}
            aria-invalid={inv("contactName")} aria-describedby={desc("contactName")} autoComplete="name" />
          <ErrorText id="err-contactName" msg={errors.contactName} />
        </div>
        <div>
          <label htmlFor="f-contactEmail" className="field-label">E-post</label>
          <input id="f-contactEmail" type="email" className="input" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)}
            aria-invalid={inv("contactEmail")} aria-describedby={desc("contactEmail")} autoComplete="email" />
          <ErrorText id="err-contactEmail" msg={errors.contactEmail} />
        </div>
        <div>
          <label htmlFor="f-contactPhone" className="field-label">Telefon <span className="font-normal text-muted">(valgfritt)</span></label>
          <input id="f-contactPhone" type="tel" className="input" value={v.contactPhone} maxLength={40} onChange={(e) => set("contactPhone", e.target.value)}
            aria-invalid={inv("contactPhone")} aria-describedby={desc("contactPhone")} autoComplete="tel" />
          <ErrorText id="err-contactPhone" msg={errors.contactPhone} />
        </div>

        {/* Honeypot: skjult for mennesker og hjelpemidler */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Ikke fyll ut dette feltet<input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
      </fieldset>

      {serverError && (
        <p role="alert" className="mt-6 rounded-xl border-2 border-err px-4 py-3 font-semibold text-err">
          Vi fikk ikke sendt forespørselen. Prøv igjen, eller kontakt <a className="underline" href={`mailto:${props.contactEmail || "kai@chenmedia.no"}`}>{props.contactEmail || "kai@chenmedia.no"}</a>.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
        <button type="submit" className="btn btn-accent" disabled={disabled || sending || stale} aria-disabled={disabled || sending || stale}>
          {sending ? "Sender …" : "Send forespørsel"}
        </button>
        <p className="text-sm text-muted md:max-w-md">Dette er en forespørsel. Oppdraget er bekreftet først når du har fått bekreftelse fra Chen Media.</p>
      </div>
    </form>
  );
}
