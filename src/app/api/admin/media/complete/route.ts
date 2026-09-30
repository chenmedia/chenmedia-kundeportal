import { NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin, sameOrigin } from "@/server/admin-auth";
import { completeUpload } from "@/server/media";
import { customerExists } from "@/server/customers";

export const dynamic = "force-dynamic";

const body = z.object({ customerId: z.string().min(1), key: z.string().length(32), filename: z.string().max(300).default("bilde") });

export async function POST(req: Request) {
  if (!(await currentAdmin())) return NextResponse.json({ ok: false, error: "Ikke innlogget." }, { status: 401 });
  if (!sameOrigin(req.headers)) return NextResponse.json({ ok: false, error: "Ugyldig origin." }, { status: 403 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "Ugyldig forespørsel." }, { status: 400 });
  if (!(await customerExists(p.data.customerId))) {
    return NextResponse.json({ ok: false, error: "Ukjent kunde." }, { status: 404 });
  }
  const r = await completeUpload(p.data.customerId, p.data.key, p.data.filename);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
