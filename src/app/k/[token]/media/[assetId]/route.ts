import { resolvePublished } from "@/server/customers";
import { readAsset } from "@/server/media";
import { imageResponse, notFoundResponse } from "@/server/image-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await params;
  const pub = await resolvePublished(token);
  if (!pub) return notFoundResponse();
  // Bare bilder som tilhører kunden og er brukt i den publiserte versjonen.
  if (pub.content.heroImageId !== assetId) return notFoundResponse();
  const file = await readAsset(assetId);
  if (!file || file.asset.customerId !== pub.customerId) return notFoundResponse();
  return imageResponse(file.data, file.asset.mimeType);
}
