import Link from "next/link";
import { notFound } from "next/navigation";
import { customerForEditor } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { canonical, emptyContent, parseContent } from "@/lib/content";
import { formatDateTime } from "@/lib/format";
import { getAdminCustomerLink } from "@/server/customers";
import { DraftEditor } from "@/components/DraftEditor";
import { CustomerControls } from "@/components/CustomerControls";
import { CompanyContactCard } from "@/components/CompanyContactCard";

export default async function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await customerForEditor(id);
  if (!c) notFound();
  const content = c.draft ? parseContent(c.draft.content) : emptyContent();
  const differs = !c.currentVersion || canonical(content) !== canonical(parseContent(c.currentVersion.content)) || c.name !== c.currentVersion.customerName;
  const link = await getAdminCustomerLink(c.id);
  const status = !c.active ? "Deaktivert" : c.currentVersion ? "Publisert" : "Ikke publisert";

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin" className="link text-sm">← Til kundene</Link>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <h1 className="display text-3xl">{c.name}</h1>
          <span className="badge">{status}</span>
        </div>
        <p className="mt-1 text-muted">
          {c.currentVersion ? <>Aktiv versjon v{c.currentVersion.number} ({c.currentVersion.label}), publisert {formatDateTime(c.currentVersion.publishedAt)}.</> : "Ingenting er publisert ennå."}
        </p>
      </div>

      <CompanyContactCard customerId={c.id} contact={{ contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone }} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <DraftEditor
          customerId={c.id}
          initialName={c.name}
          needsRename={c.needsRename}
          initialContent={content}
          assets={c.assets.map((a) => ({ id: a.id, name: a.originalName, width: a.width, height: a.height }))}
        />
        <CustomerControls
          customerId={c.id}
          link={link}
          active={c.active}
          published={!!c.currentVersion}
          differs={differs}
          versionNumber={c.currentVersion?.number ?? null}
        />
      </div>
    </div>
  );
}
