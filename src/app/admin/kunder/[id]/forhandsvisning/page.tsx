import Link from "next/link";
import { notFound } from "next/navigation";
import { portalWithDraft } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { parseContent, emptyContent } from "@/lib/content";
import { PORTALS, parsePortalKind } from "@/lib/portal";
import { CustomerPage } from "@/components/CustomerPage";

export default async function Preview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tjeneste?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const kind = parsePortalKind((await searchParams).tjeneste) ?? "photo";
  const portal = await portalWithDraft(id, kind);
  if (!portal) notFound();
  const c = portal.customer;
  const content = portal.draft ? parseContent(portal.draft.content) : emptyContent(kind);
  return (
    <div className="preview-shell -mx-5 -my-8 md:-mx-8 md:-my-10">
      <div className="no-print sticky top-0 z-50 bg-ink text-white px-5 py-3 flex flex-wrap items-center gap-3 on-dark" role="status">
        <span className="badge !bg-accent !text-white !border-accent">Utkast</span>
        <span className="text-sm">Forhåndsvisning av utkastet for {c.name} ({PORTALS[kind].label.toLowerCase()}). Dette vises ikke for kunden før du publiserer.</span>
        <Link href={`/admin/kunder/${c.id}?tjeneste=${PORTALS[kind].slug}`} className="btn btn-outline btn-sm !text-white !border-white ml-auto hover:!bg-white hover:!text-ink">Tilbake til redigering</Link>
      </div>
      <div className="bg-cream">
        <CustomerPage
          customerName={c.name}
          kind={kind}
          content={content}
          versionId="draft"
          versionNumber={0}
          publishedAt={null}
          mediaUrl={(assetId) => `/admin/media/${assetId}`}
          formDisabledReason="Skjemaet er deaktivert i forhåndsvisning."
        />
      </div>
    </div>
  );
}
