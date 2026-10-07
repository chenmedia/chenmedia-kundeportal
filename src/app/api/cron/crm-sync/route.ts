import { NextResponse } from "next/server";
import { cronAuthorized } from "@/server/cron";
import { retryOutstandingCrmSyncs } from "@/server/hubspot";
import { logError } from "@/server/log";

export const dynamic = "force-dynamic";

/** Daglig sveip som prøver feilede overføringer til HubSpot på nytt (se vercel.json). */
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, processed: await retryOutstandingCrmSyncs() });
  } catch (e) {
    logError("cron.crm-sync", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
