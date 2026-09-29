import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { currentAdmin } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

/** Midlertidig varsling i nettsiden: antall nye forespørsler og de nyeste. */
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const [newCount, latest, failedEmails] = await Promise.all([
    db.inquiry.count({ where: { status: "new" } }),
    db.inquiry.findMany({
      where: { status: "new" }, orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, eventName: true, createdAt: true, customer: { select: { name: true } } },
    }),
    db.emailJob.count({ where: { status: "failed" } }),
  ]);
  return NextResponse.json({
    ok: true, newCount, failedEmails,
    latest: latest.map((i) => ({ id: i.id, eventName: i.eventName, customerName: i.customer.name, createdAt: i.createdAt.toISOString() })),
  });
}
