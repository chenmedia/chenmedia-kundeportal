import Link from "next/link";
import { dashboardData } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { formatDateTime } from "@/lib/format";
import { PORTALS, portalLabel, sortKinds } from "@/lib/portal";
import { duplicateAction } from "./actions";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const { customers, newInquiries, failedJobs, newCountByCustomer: counts } = await dashboardData(query);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-3xl">Kunder</h1>
        <Link href="/admin/kunder/ny" className="btn btn-accent">Opprett kunde</Link>
      </div>

      {failedJobs > 0 && (
        <p role="alert" className="card px-5 py-4 border-2 !border-err font-semibold">
          {failedJobs} e-post{failedJobs === 1 ? "" : "er"} har feilet. <Link className="link" href="/admin/foresporsler?epost=feilet">Se forespørslene</Link> og prøv på nytt.
        </p>
      )}

      <section aria-labelledby="nye" className="card p-6">
        <h2 id="nye" className="title text-lg">Nye forespørsler</h2>
        {newInquiries.length === 0 ? (
          <p className="mt-2 text-muted">Ingen nye forespørsler akkurat nå.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {newInquiries.map((i) => (
              <li key={i.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link className="link font-semibold" href={`/admin/foresporsler/${i.id}`}>{i.eventName}</Link>
                <span className="text-sm text-muted">{i.customer.name} · {formatDateTime(i.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3"><Link className="link text-sm font-semibold" href="/admin/foresporsler">Se alle forespørsler →</Link></p>
      </section>

      <section aria-labelledby="oversikt" className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="oversikt" className="title text-lg">Alle kunder</h2>
          <form role="search" className="flex gap-2">
            <label htmlFor="q" className="sr-only">Søk etter kundenavn</label>
            <input id="q" name="q" defaultValue={query} className="input !min-h-[40px]" placeholder="Søk på navn" />
            <button className="btn btn-outline btn-sm" type="submit">Søk</button>
          </form>
        </div>
        {customers.length === 0 ? (
          <p className="mt-4 text-muted">{query ? "Ingen kunder matcher søket." : "Ingen kunder ennå. Opprett den første."}</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="tbl text-[15px]">
              <thead>
                <tr className="eyebrow"><th>Kunde</th><th>Status</th><th>Portaler</th><th>Nye</th><th><span className="sr-only">Handlinger</span></th></tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const portals = sortKinds(c.portals);
                  const status = !c.active ? "Deaktivert" : portals.some((p) => p.currentVersion) ? "Publisert" : "Ikke publisert";
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="font-semibold">{c.name}</span>
                        {(c.contactName || c.contactEmail) && <span className="block text-sm text-muted">{c.contactName || c.contactEmail}</span>}
                      </td>
                      <td><span className="badge">{status}</span></td>
                      <td>
                        <ul className="grid gap-1">
                          {portals.map((p) => (
                            <li key={p.kind}>
                              <Link className="link font-semibold" href={`/admin/kunder/${c.id}?tjeneste=${PORTALS[p.kind as keyof typeof PORTALS]?.slug ?? p.kind}`}>{portalLabel(p.kind)}</Link>
                              <span className="text-sm text-muted"> · {p.currentVersion ? `${p.currentVersion.label} (v${p.currentVersion.number}), ${formatDateTime(p.currentVersion.publishedAt)}` : "ikke publisert"}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td>{counts.get(c.id) ?? 0}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-2">
                          <Link href={`/admin/kunder/${c.id}`} className="btn btn-dark btn-sm" aria-label={`Åpne ${c.name}`}>Åpne</Link>
                          <form action={duplicateAction.bind(null, c.id)}>
                            <ConfirmButton className="btn btn-outline btn-sm" ariaLabel={`Dupliser ${c.name}`} message={`Opprette en kopi av ${c.name}? Kopien får samme innhold og må få et nytt navn før den kan publiseres.`}>Dupliser</ConfirmButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
