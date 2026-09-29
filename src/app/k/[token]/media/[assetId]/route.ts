import { resolvePublished } from "@/server/customers";
import { assetOwner, serveAsset } from "@/server/media";
import { notFoundResponse } from "@/server/image-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await params;
  const pub = await resolvePublished(token);
  if (!pub) return notFoundResponse();
  // Bare bilder som tilhører kunden og er brukt i den publiserte versjonen.
  if (pub.content.heroImageId !== assetId) return notFoundResponse();
  if ((await assetOwner(assetId)) !== pub.customerId) return notFoundResponse();
  const served = await serveAsset(assetId);
  return served ? served.response : notFoundResponse();
}
