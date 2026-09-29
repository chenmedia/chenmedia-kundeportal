import { NextResponse } from "next/server";
import { z } from "zod";
import { inquiryInputSchema } from "@/lib/inquiry";
import { submitInquiry } from "@/server/inquiries";
import { allow, clientIp } from "@/server/rate-limit";
import { sameOrigin } from "@/server/admin-auth";
import { sha256 } from "@/server/crypto";
import { logError } from "@/server/log";

export const dynamic = "force-dynamic";

const envelope = z.object({
  idempotencyKey: z.string().min(16).max(100),
  versionId: z.string().min(1).max(100),
  website: z.string().max(500).default(""),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!sameOrigin(req.headers)) return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });

  const raw = await req.text();
  if (raw.length > 30_000) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 }); }

  const ip = clientIp(req.headers);
  if (!(await allow(`inq:${ip}:${sha256(token).slice(0, 16)}`, 10, 10 * 60))) {
    return NextResponse.json({ ok: false, error: "rate" }, { status: 429 });
  }

  const env = envelope.safeParse(body);
  if (!env.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  // Honeypot: late som om det gikk bra, men lagre ingenting.
  if (env.data.website.trim() !== "") {
    return NextResponse.json({ ok: true, receipt: { reference: "CM-000000", packageName: "", eventName: "", eventDate: null } });
  }

  const parsed = inquiryInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "form");
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return NextResponse.json({ ok: false, error: "validation", fieldErrors }, { status: 422 });
  }

  try {
    const r = await submitInquiry({ token, versionId: env.data.versionId, idempotencyKey: env.data.idempotencyKey, input: parsed.data });
    if (r.ok) {
      const { reference, packageName, eventName, eventDate } = r;
      return NextResponse.json({ ok: true, receipt: { reference, packageName, eventName, eventDate } });
    }
    if (r.code === "UNAVAILABLE") return NextResponse.json({ ok: false, error: "unavailable" }, { status: 404 });
    return NextResponse.json({ ok: false, error: r.code.toLowerCase() }, { status: 409 });
  } catch (e) {
    logError("inquiry.submit", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
