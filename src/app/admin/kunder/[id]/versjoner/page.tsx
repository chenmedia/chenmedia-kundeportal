import Link from "next/link";
import { notFound } from "next/navigation";
import { customerVersions } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { formatDateTime } from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import { restoreVersionAction } from "@/app/admin/actions";

export default async function Versions({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await customerVersions(id);
  if (!c) notFound();
  return (
    <div>
      <Link href={`/admin/kunder/${c.id}`} className="link text-sm">← Til {c.name}</Link>
      <h1 className="display text-3xl mt-3">Versjonshistorikk</h1>
      <p className="mt-2 text-muted">Publiserte versjoner kan ikke endres. «Gjenopprett som utkast» kopierer en gammel versjon inn i utkastet, som du så kan justere og publisere som en ny versjon.</p>
      {c.versions.length === 0 ? (
        <p className="card p-6 mt-6">Ingen publiserte versjoner ennå.</p>
      ) : (
        <div className="card p-4 mt-6 overflow-x-auto">
          <table className="tbl text-[15px]">
            <thead><tr className="eyebrow"><th>Versjon</th><th>Avtaleetikett</th><th>Publisert</th><th></th><th></th></tr></thead>
            <tbody>
              {c.versions.map((v) => (
                <tr key={v.id}>
                  <td className="mono-num">v{v.number}{v.id === c.currentVersionId && <span className="badge badge-fill ml-3">Aktiv</span>}</td>
                  <td>{v.label}</td>
                  <td>{formatDateTime(v.publishedAt)}</td>
                  <td><Link className="link font-semibold" href={`/admin/kunder/${c.id}/versjoner/${v.number}`}>Vis versjon</Link></td>
                  <td>
                    <form action={restoreVersionAction.bind(null, c.id, v.number)}>
                      <ConfirmButton className="link font-semibold" ariaLabel={`Gjenopprett versjon ${v.number} som utkast`} message={`Erstatte utkastet med innholdet i versjon ${v.number}? Endringer i utkastet som ikke er publisert går tapt. Den aktive versjonen påvirkes ikke.`}>Gjenopprett som utkast</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
