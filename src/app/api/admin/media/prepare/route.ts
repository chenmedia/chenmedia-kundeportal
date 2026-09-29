import { NextResponse } from "next/server";
import { currentAdmin, sameOrigin } from "@/server/admin-auth";
import { prepareUpload } from "@/server/media";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await currentAdmin())) return NextResponse.json({ ok: false, error: "Ikke innlogget." }, { status: 401 });
  if (!sameOrigin(req.headers)) return NextResponse.json({ ok: false, error: "Ugyldig origin." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await prepareUpload()) });
  } catch {
    return NextResponse.json({ ok: false, error: "Bildelagring er ikke tilgjengelig. Sjekk oppsettet." }, { status: 503 });
  }
}
