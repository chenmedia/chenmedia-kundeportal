import { NextResponse } from "next/server";
import { cronAuthorized } from "@/server/cron";
import { runRetention } from "@/server/retention";
import { logError } from "@/server/log";

export const dynamic = "force-dynamic";

/** Daglig opprydding av personopplysninger etter fristene i INQUIRY_RETENTION_MONTHS / EMAIL_BODY_RETENTION_DAYS. */
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runRetention()) });
  } catch (e) {
    logError("cron.retention", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
