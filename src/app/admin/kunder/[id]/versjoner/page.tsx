import Link from "next/link";
import { notFound } from "next/navigation";
import { portalVersions } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { formatDateTime } from "@/lib/format";
import { PORTALS, parsePortalKind } from "@/lib/portal";
import { ConfirmButton } from "@/components/ConfirmButton";
import { restoreVersionAction } from "@/app/admin/actions";

export default async function Versions({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tjeneste?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const kind = parsePortalKind((await searchParams).tjeneste) ?? "photo";
  const portal = await portalVersions(id, kind);
  if (!portal) notFound();
  const c = { id, name: portal.customer.name, versions: portal.versions, currentVersionId: portal.currentVersionId };
  const slug = PORTALS[kind].slug;
  return (
    <div>
      <Link href={`/admin/kunder/${c.id}?tjeneste=${slug}`} className="link text-sm">← Til {c.name}</Link>
      <h1 className="display text-3xl mt-3">Versjonshistorikk · {PORTALS[kind].label}</h1>
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
                  <td><Link className="link font-semibold" href={`/admin/kunder/${c.id}/versjoner/${v.number}?tjeneste=${slug}`}>Vis versjon</Link></td>
                  <td>
                    <form action={restoreVersionAction.bind(null, c.id, kind, v.number)}>
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
