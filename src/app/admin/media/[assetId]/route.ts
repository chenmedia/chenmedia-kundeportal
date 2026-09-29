import { currentAdmin } from "@/server/admin-auth";
import { readAsset } from "@/server/media";
import { imageResponse, notFoundResponse } from "@/server/image-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  if (!(await currentAdmin())) return new Response("Ikke innlogget", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { assetId } = await params;
  const file = await readAsset(assetId);
  if (!file) return notFoundResponse();
  return imageResponse(file.data, file.asset.mimeType);
}
