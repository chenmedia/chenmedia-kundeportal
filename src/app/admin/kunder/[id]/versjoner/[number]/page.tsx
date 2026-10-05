import Link from "next/link";
import { notFound } from "next/navigation";
import { versionByNumber } from "@/server/queries";
import { requireAdmin } from "@/server/admin-auth";
import { parseContent } from "@/lib/content";
import { CustomerPage } from "@/components/CustomerPage";

export default async function VersionView({ params }: { params: Promise<{ id: string; number: string }> }) {
  await requireAdmin();
  const { id, number } = await params;
  const v = await versionByNumber(id, Number(number) || -1);
  if (!v) notFound();
  return (
    <div className="preview-shell -mx-5 -my-8 md:-mx-8 md:-my-10">
      <div className="no-print sticky top-0 z-50 bg-ink text-white px-5 py-3 flex flex-wrap items-center gap-3 on-dark" role="status">
        <span className="badge">Versjon {v.number}</span>
        <span className="text-sm">Arkivvisning. Skjemaet er deaktivert.</span>
        <Link href={`/admin/kunder/${id}/versjoner`} className="btn btn-outline btn-sm !text-white !border-white ml-auto hover:!bg-white hover:!text-ink">Til historikk</Link>
      </div>
      <div className="bg-cream">
        <CustomerPage
          customerName={v.customerName}
          content={parseContent(v.content)}
          versionId={v.id}
          versionNumber={v.number}
          publishedAt={v.publishedAt}
          mediaUrl={(assetId) => `/admin/media/${assetId}`}
          formDisabledReason="Skjemaet er deaktivert i arkivvisning."
        />
      </div>
    </div>
  );
}
