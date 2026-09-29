import { NextResponse } from "next/server";
import { currentAdmin, sameOrigin } from "@/server/admin-auth";
import { KEY_RE, getStore } from "@/server/storage";
import { MAX_UPLOAD } from "@/server/media";

export const dynamic = "force-dynamic";

/** Opplastingsmål for lokal utvikling (uten Supabase). Brukes ikke i drift. */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sameOrigin(req.headers)) return NextResponse.json({ ok: false }, { status: 403 });
  const store = getStore();
  const { key } = await params;
  if (store.kind !== "local" || !KEY_RE.test(key)) return NextResponse.json({ ok: false }, { status: 404 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_UPLOAD) return NextResponse.json({ ok: false, error: "For stor." }, { status: 413 });
  await store.put(key, buf, "application/octet-stream");
  return NextResponse.json({ ok: true });
}
