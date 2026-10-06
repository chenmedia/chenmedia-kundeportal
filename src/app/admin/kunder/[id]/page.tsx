import Link from "next/link";
import { notFound } from "next/navigation";
import { customerForEditor } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { canonical, emptyContent, parseContent, publishWarnings } from "@/lib/content";
import { PORTAL_KINDS, PORTALS, parsePortalKind, sortKinds } from "@/lib/portal";
import { formatDateTime } from "@/lib/format";
import { getAdminCustomerLink } from "@/server/customers";
import { addPortalAction } from "@/app/admin/actions";
import { DraftEditor } from "@/components/DraftEditor";
import { CustomerControls } from "@/components/CustomerControls";
import { EditorStateProvider } from "@/components/EditorState";
import { CompanyContactCard } from "@/components/CompanyContactCard";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function CustomerEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gjenopprettet?: string; tjeneste?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const restored = Number(sp.gjenopprettet) || null;
  const c = await customerForEditor(id);
  if (!c) notFound();

  const portals = sortKinds(c.portals);
  // Valgt portal: ?tjeneste=film, ellers den første kunden har. Er den valgte typen ikke opprettet, tilbys den som ny portal.
  const kind = parsePortalKind(sp.tjeneste) ?? (portals[0]?.kind as (typeof PORTAL_KINDS)[number] | undefined) ?? "photo";
  const portal = portals.find((p) => p.kind === kind) ?? null;
  const cfg = PORTALS[kind];

  const content = portal ? (portal.draft ? parseContent(portal.draft.content) : emptyContent(kind)) : null;
  const differs = !!portal && !!content && (!portal.currentVersion || canonical(content) !== canonical(parseContent(portal.currentVersion.content)) || c.name !== portal.currentVersion.customerName);
  const link = await getAdminCustomerLink(c.id);
  const anyPublished = portals.some((p) => p.currentVersion);
  const status = !c.active ? "Deaktivert" : anyPublished ? "Publisert" : "Ikke publisert";

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin" className="link text-sm">← Til kundene</Link>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <h1 className="display text-3xl">{c.name}</h1>
          <span className="badge">{status}</span>
        </div>
      </div>

      <CompanyContactCard customerId={c.id} contact={{ contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone }} />

      <nav aria-label="Portaler" className="flex flex-wrap items-center gap-2">
        {PORTAL_KINDS.map((k) => {
          const p = portals.find((x) => x.kind === k);
          return (
            <Link key={k} href={`/admin/kunder/${c.id}?tjeneste=${PORTALS[k].slug}`} className="tab" aria-current={k === kind ? "page" : undefined} data-testid={`admin-tab-${PORTALS[k].slug}`}>
              {PORTALS[k].label}
              <span className="sr-only">{p ? (p.currentVersion ? ", publisert" : ", ikke publisert") : ", ikke opprettet"}</span>
              {p ? <span aria-hidden="true" className={`ml-2 text-xs ${p.currentVersion ? "opacity-100" : "opacity-60"}`}>{p.currentVersion ? "● Publisert" : "○ Utkast"}</span> : <span aria-hidden="true" className="ml-2 text-xs opacity-60">+ Ikke opprettet</span>}
            </Link>
          );
        })}
      </nav>

      {restored && portal && (
        <p role="status" className="card p-4 font-semibold">
          Utkastet er erstattet med innholdet i versjon {restored}. Ingenting er publisert, og den aktive versjonen er uendret.
        </p>
      )}

      {portal && content ? (
        <>
          <p className="text-muted -mt-2">
            {cfg.label}:{" "}
            {portal.currentVersion ? <>aktiv versjon v{portal.currentVersion.number} ({portal.currentVersion.label}), publisert {formatDateTime(portal.currentVersion.publishedAt)}.</> : "ingenting er publisert ennå."}
          </p>
          {/* key: editoren holder tilstand (utkast, ulagrede endringer), så den må starte på nytt når portalen byttes. */}
          <EditorStateProvider key={portal.id}>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
              <DraftEditor
                customerId={c.id}
                kind={kind}
                initialName={c.name}
                needsRename={c.needsRename}
                initialContent={content}
                draftUpdatedAt={portal.draft?.updatedAt.toISOString() ?? null}
                assets={c.assets.map((a) => ({ id: a.id, name: a.originalName, width: a.width, height: a.height }))}
              />
              <CustomerControls
                customerId={c.id}
                kind={kind}
                link={link}
                active={c.active}
                published={!!portal.currentVersion}
                differs={differs}
                versionNumber={portal.currentVersion?.number ?? null}
                warnings={publishWarnings(content)}
              />
            </div>
          </EditorStateProvider>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
          <section className="card p-6 grid gap-3 justify-items-start">
            <h2 className="title text-lg">{c.name} har ingen {cfg.label.toLowerCase()}-portal ennå</h2>
            <p className="text-muted">
              Portalen får et eget tomt utkast, egne pakker og priser og egne versjoner. Kontaktperson og vilkår kopieres fra den andre portalen.
              Kunden bruker samme lenke, og ser portalen som en egen fane når den er publisert.
            </p>
            <form action={addPortalAction.bind(null, c.id, kind)}>
              <ConfirmButton className="btn btn-accent" message={`Opprette ${cfg.label.toLowerCase()}-portal for ${c.name}? Ingenting vises for kunden før du publiserer.`}>Opprett {cfg.label.toLowerCase()}-portal</ConfirmButton>
            </form>
          </section>
          <CustomerControls customerId={c.id} kind={kind} link={link} active={c.active} published={false} differs={false} versionNumber={null} noPortal />
        </div>
      )}
    </div>
  );
}
