import Link from "next/link";
import { INQUIRY_MAX, INQUIRY_PAGE, inquiryList } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { STATUS_LABELS, STATUSES, InquirySnapshot } from "@/lib/inquiry";
import { StatusBadge } from "@/components/AdminBits";
import { DeleteByEmailForm } from "@/components/InquiryAdminForms";
import { hubspotConfigured } from "@/server/hubspot";
import { emailBodyRetentionDays, inquiryRetentionMonths } from "@/server/retention";

export default async function Inquiries({ searchParams }: { searchParams: Promise<{ status?: string; kunde?: string; epost?: string; hubspot?: string; q?: string; antall?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const take = Math.min(Math.max(Number(sp.antall) || INQUIRY_PAGE, INQUIRY_PAGE), INQUIRY_MAX);
  const filters = { status, customerId: sp.kunde || undefined, failedEmail: sp.epost === "feilet", failedCrm: sp.hubspot === "feilet", q: q || undefined };
  const { customers, list, total } = await inquiryList(filters, take);
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (sp.kunde) params.set("kunde", sp.kunde);
  if (sp.epost === "feilet") params.set("epost", "feilet");
  if (sp.hubspot === "feilet") params.set("hubspot", "feilet");
  if (q) params.set("q", q);
  const exportHref = `/admin/foresporsler/eksport${params.size ? `?${params}` : ""}`;
  const moreHref = `/admin/foresporsler?${new URLSearchParams({ ...Object.fromEntries(params), antall: String(take + INQUIRY_PAGE) })}`;

  return (
    <div className="grid gap-6">
      <h1 className="display text-3xl">Forespørsler</h1>
      <form className="card p-5 flex flex-wrap items-end gap-4" role="search" aria-label="Filtrer forespørsler">
        <div>
          <label htmlFor="q" className="field-label">Søk</label>
          <input id="q" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Arrangement, kontakt, e-post, referanse" className="input !w-64" />
        </div>
        <div>
          <label htmlFor="status" className="field-label">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input !w-auto">
            <option value="">Alle</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="kunde" className="field-label">Kunde</label>
          <select id="kunde" name="kunde" defaultValue={sp.kunde ?? ""} className="input !w-auto">
            <option value="">Alle</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label className="check text-sm pb-3">
          <input type="checkbox" name="epost" value="feilet" defaultChecked={sp.epost === "feilet"} />
          <span>Bare med feilet e-post</span>
        </label>
        <label className="check text-sm pb-3">
          <input type="checkbox" name="hubspot" value="feilet" defaultChecked={sp.hubspot === "feilet"} />
          <span>Bare ikke overført til HubSpot</span>
        </label>
        <button className="btn btn-dark btn-sm mb-1" type="submit">Filtrer</button>
      </form>

      <p className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" aria-live="polite">
        <span className="text-muted">Viser {list.length} av {total} {total === 1 ? "forespørsel" : "forespørsler"}.</span>
        {total > list.length && take < INQUIRY_MAX && <Link className="link font-semibold" href={moreHref}>Vis flere</Link>}
        {total > list.length && take >= INQUIRY_MAX && <span className="text-muted">Bruk søk eller filter for å se resten.</span>}
        {total > 0 && <a className="link font-semibold" href={exportHref} download>Last ned som CSV (alle {total})</a>}
      </p>

      {list.length === 0 ? (
        <p className="card p-6 text-muted">Ingen forespørsler {status || sp.kunde || sp.epost || sp.hubspot || q ? "matcher filteret" : "ennå"}. Nye forespørsler fra kundesidene vises her.</p>
      ) : (
        <div className="card p-4 overflow-x-auto">
          <table className="tbl text-[15px]">
            <thead><tr className="eyebrow"><th>Kunde</th><th>Arrangement</th><th>Dato</th><th>Pakke</th><th>Innsendt</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((i) => {
                const snap = JSON.parse(i.snapshot) as InquirySnapshot;
                const failed = i.emailJobs.some((j) => j.status === "failed");
                const crmFailed = !!i.crmSync && i.crmSync.status !== "synced";
                return (
                  <tr key={i.id}>
                    <td>{i.customer.name}</td>
                    <td><Link className="link font-semibold" href={`/admin/foresporsler/${i.id}`}>{i.eventName}</Link><span className="block text-xs mono-num text-muted">{i.reference}</span></td>
                    <td>{i.eventDate ? formatCalendarDate(i.eventDate) : "Ikke avklart"}</td>
                    <td>{snap.package?.name ?? "Annet behov"}</td>
                    <td className="whitespace-nowrap">{formatDateTime(i.createdAt)}</td>
                    <td><StatusBadge status={i.status} />{failed && <span className="badge ml-2 !border-err !text-err">E-post feilet</span>}{crmFailed && <span className="badge ml-2 !border-err !text-err">HubSpot ikke overført</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="card p-5 grid gap-3" aria-labelledby="personvern-title">
        <h2 id="personvern-title" className="title text-lg">Personvern</h2>
        <p className="text-sm text-muted">
          {inquiryRetentionMonths()
            ? `Avsluttede forespørsler slettes automatisk når de ikke er endret på ${inquiryRetentionMonths()} måneder.`
            : "Ingen automatisk sletting av forespørsler er slått på (INQUIRY_RETENTION_MONTHS er ikke satt)."}{" "}
          {hubspotConfigured() && "Forespørsler som er overført til HubSpot slettes ikke av disse fristene: de følges opp i HubSpot. Sletting av en adresse nedenfor arkiverer dealene i HubSpot. "}
          {emailBodyRetentionDays()
            ? `Innholdet i sendte e-poster tømmes etter ${emailBodyRetentionDays()} dager.`
            : "Innholdet i sendte e-poster beholdes (EMAIL_BODY_RETENTION_DAYS er ikke satt)."}
        </p>
        <details>
          <summary className="link font-semibold cursor-pointer">Slett alt fra en e-postadresse</summary>
          <div className="mt-4"><DeleteByEmailForm crmEnabled={hubspotConfigured()} /></div>
        </details>
      </section>
    </div>
  );
}
