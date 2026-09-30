import Link from "next/link";
import { notFound } from "next/navigation";
import { customerVersions } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { formatDateTime } from "@/lib/format";

export default async function Versions({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await customerVersions(id);
  if (!c) notFound();
  return (
    <div>
      <Link href={`/admin/kunder/${c.id}`} className="link text-sm">← Til {c.name}</Link>
      <h1 className="display text-3xl mt-3">Versjonshistorikk</h1>
      <p className="mt-2 text-muted">Publiserte versjoner kan ikke endres. Å gjenopprette en gammel versjon gjøres manuelt i utkastet.</p>
      {c.versions.length === 0 ? (
        <p className="card p-6 mt-6">Ingen publiserte versjoner ennå.</p>
      ) : (
        <div className="card p-4 mt-6 overflow-x-auto">
          <table className="tbl text-[15px]">
            <thead><tr className="eyebrow"><th>Versjon</th><th>Avtaleetikett</th><th>Publisert</th><th></th></tr></thead>
            <tbody>
              {c.versions.map((v) => (
                <tr key={v.id}>
                  <td className="mono-num">v{v.number}{v.id === c.currentVersionId && <span className="badge badge-fill ml-3">Aktiv</span>}</td>
                  <td>{v.label}</td>
                  <td>{formatDateTime(v.publishedAt)}</td>
                  <td><Link className="link font-semibold" href={`/admin/kunder/${c.id}/versjoner/${v.number}`}>Vis versjon</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
