import { contentImageIds } from "@/lib/content";
import { resolvePublishedPortals } from "@/server/customers";
import { assetOwner, serveAsset } from "@/server/media";
import { notFoundResponse } from "@/server/image-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await params;
  const pub = await resolvePublishedPortals(token);
  if (!pub) return notFoundResponse();
  // Bare bilder som tilhører kunden og er brukt i en publisert versjon (hero, pakker, galleri) av en av portalene.
  if (!pub.portals.some((p) => contentImageIds(p.content).includes(assetId))) return notFoundResponse();
  if ((await assetOwner(assetId)) !== pub.customerId) return notFoundResponse();
  const served = await serveAsset(assetId);
  return served ? served.response : notFoundResponse();
}
