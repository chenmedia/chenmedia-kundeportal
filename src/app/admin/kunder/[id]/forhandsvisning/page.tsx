import Link from "next/link";
import { notFound } from "next/navigation";
import { customerWithDraft } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { parseContent, emptyContent } from "@/lib/content";
import { CustomerPage } from "@/components/CustomerPage";

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await customerWithDraft(id);
  if (!c) notFound();
  const content = c.draft ? parseContent(c.draft.content) : emptyContent();
  return (
    <div className="preview-shell -mx-5 -my-8 md:-mx-8 md:-my-10">
      <div className="no-print sticky top-0 z-50 bg-ink text-white px-5 py-3 flex flex-wrap items-center gap-3 on-dark" role="status">
        <span className="badge !bg-accent !text-white !border-accent">Utkast</span>
        <span className="text-sm">Forhåndsvisning av utkastet for {c.name}. Dette vises ikke for kunden før du publiserer.</span>
        <Link href={`/admin/kunder/${c.id}`} className="btn btn-outline btn-sm !text-white !border-white ml-auto hover:!bg-white hover:!text-ink">Tilbake til redigering</Link>
      </div>
      <div className="bg-cream">
        <CustomerPage
          customerName={c.name}
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
