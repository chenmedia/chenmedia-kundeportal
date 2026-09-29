import Link from "next/link";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { formatDateTime } from "@/lib/content";
import { duplicateAction } from "./actions";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const [customers, newInquiries, failedJobs, newCounts] = await Promise.all([
    db.customer.findMany({
      where: query ? { name: { contains: query } } : undefined,
      orderBy: { name: "asc" },
      include: { currentVersion: true },
    }),
    db.inquiry.findMany({ where: { status: "new" }, orderBy: { createdAt: "desc" }, take: 5, include: { customer: true } }),
    db.emailJob.count({ where: { status: "failed" } }),
    db.inquiry.groupBy({ by: ["customerId"], where: { status: "new" }, _count: true }),
  ]);
  const counts = new Map(newCounts.map((c) => [c.customerId, c._count]));

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
                <tr className="eyebrow"><th>Kunde</th><th>Status</th><th>Avtale</th><th>Siste publisering</th><th>Nye</th><th><span className="sr-only">Handlinger</span></th></tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const status = !c.active ? "Deaktivert" : c.currentVersion ? "Publisert" : "Ikke publisert";
                  return (
                    <tr key={c.id}>
                      <td className="font-semibold">{c.name}</td>
                      <td><span className="badge">{status}</span></td>
                      <td>{c.currentVersion?.label ?? "–"}</td>
                      <td>{c.currentVersion ? formatDateTime(c.currentVersion.publishedAt) : "–"}</td>
                      <td>{counts.get(c.id) ?? 0}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-2">
                          <Link href={`/admin/kunder/${c.id}`} className="btn btn-dark btn-sm" aria-label={`Åpne ${c.name}`}>Åpne</Link>
                          <form action={duplicateAction.bind(null, c.id)}>
                            <button className="btn btn-outline btn-sm" aria-label={`Dupliser ${c.name}`}>Dupliser</button>
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
