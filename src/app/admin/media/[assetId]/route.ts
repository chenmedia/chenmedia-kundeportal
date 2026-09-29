import { currentAdmin } from "@/server/admin-auth";
import { serveAsset } from "@/server/media";
import { notFoundResponse } from "@/server/image-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  if (!(await currentAdmin())) return new Response("Ikke innlogget", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { assetId } = await params;
  const served = await serveAsset(assetId);
  return served ? served.response : notFoundResponse();
}
