import { NextResponse } from "next/server";
import { currentAdmin, sameOrigin } from "@/server/admin-auth";
import { saveUpload, MAX_UPLOAD } from "@/server/media";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await currentAdmin())) return NextResponse.json({ ok: false, error: "Ikke innlogget." }, { status: 401 });
  if (!sameOrigin(req.headers)) return NextResponse.json({ ok: false, error: "Ugyldig origin." }, { status: 403 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD + 100_000) return NextResponse.json({ ok: false, error: "Filen er større enn 10 MB." }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file");
  const customerId = String(form.get("customerId") ?? "");
  if (!(file instanceof File) || !customerId) return NextResponse.json({ ok: false, error: "Mangler fil." }, { status: 400 });
  if (!(await db.customer.findUnique({ where: { id: customerId } }))) return NextResponse.json({ ok: false, error: "Ukjent kunde." }, { status: 404 });
  const r = await saveUpload(customerId, Buffer.from(await file.arrayBuffer()), file.name);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
