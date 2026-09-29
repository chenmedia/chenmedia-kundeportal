import { NextResponse } from "next/server";
import { currentAdmin } from "@/server/admin-auth";
import { failedEmailCount, newInquirySnapshot } from "@/server/queries";

export const dynamic = "force-dynamic";

/** Midlertidig varsling i nettsiden: antall nye forespørsler og de nyeste. */
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const [snapshot, failedEmails] = await Promise.all([newInquirySnapshot(), failedEmailCount()]);
  return NextResponse.json({ ok: true, failedEmails, ...snapshot });
}
