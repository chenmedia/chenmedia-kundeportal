import { NextResponse } from "next/server";
import { cronAuthorized } from "@/server/cron";
import { retryOutstandingJobs } from "@/server/email";
import { logError } from "@/server/log";

export const dynamic = "force-dynamic";

/** Daglig sveip som prøver feilede e-postjobber på nytt (se vercel.json). */
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, processed: await retryOutstandingJobs() });
  } catch (e) {
    logError("cron.email-retry", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
