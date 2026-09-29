import Link from "next/link";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { STATUS_LABELS, STATUSES, formatCalendarDate, formatDateTime, InquirySnapshot } from "@/lib/content";
import { StatusBadge } from "@/components/AdminBits";

export default async function Inquiries({ searchParams }: { searchParams: Promise<{ status?: string; kunde?: string; epost?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status : undefined;
  const [customers, list] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.inquiry.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(sp.kunde ? { customerId: sp.kunde } : {}),
        ...(sp.epost === "feilet" ? { emailJobs: { some: { status: "failed" } } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { customer: true, emailJobs: true },
      take: 200,
    }),
  ]);

  return (
    <div className="grid gap-6">
      <h1 className="display text-3xl">Forespørsler</h1>
      <form className="card p-5 flex flex-wrap items-end gap-4" role="search" aria-label="Filtrer forespørsler">
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
        <button className="btn btn-dark btn-sm mb-1" type="submit">Filtrer</button>
      </form>

      {list.length === 0 ? (
        <p className="card p-6 text-muted">Ingen forespørsler {status || sp.kunde || sp.epost ? "matcher filteret" : "ennå"}. Nye forespørsler fra kundesidene vises her.</p>
      ) : (
        <div className="card p-4 overflow-x-auto">
          <table className="tbl text-[15px]">
            <thead><tr className="eyebrow"><th>Kunde</th><th>Arrangement</th><th>Dato</th><th>Pakke</th><th>Innsendt</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((i) => {
                const snap = JSON.parse(i.snapshot) as InquirySnapshot;
                const failed = i.emailJobs.some((j) => j.status === "failed");
                return (
                  <tr key={i.id}>
                    <td>{i.customer.name}</td>
                    <td><Link className="link font-semibold" href={`/admin/foresporsler/${i.id}`}>{i.eventName}</Link><span className="block text-xs mono-num text-muted">{i.reference}</span></td>
                    <td>{i.eventDate ? formatCalendarDate(i.eventDate) : "Ikke avklart"}</td>
                    <td>{snap.package?.name ?? "Annet behov"}</td>
                    <td className="whitespace-nowrap">{formatDateTime(i.createdAt)}</td>
                    <td><StatusBadge status={i.status} />{failed && <span className="badge ml-2 !border-err !text-err">E-post feilet</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
