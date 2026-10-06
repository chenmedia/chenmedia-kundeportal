import { NextResponse } from "next/server";
import { currentAdmin } from "@/server/admin-auth";
import { inquiriesForExport } from "@/server/queries";
import { STATUS_LABELS, STATUSES, type InquirySnapshot } from "@/lib/inquiry";
import { formatPackagePrice, todayInOslo } from "@/lib/format";
import { toCsv } from "@/lib/csv";
import { logError } from "@/server/log";

export const dynamic = "force-dynamic";

/** CSV-eksport av forespørslene som matcher samme filter som listen (status, kunde, feilet e-post, søk). */
export async function GET(req: Request) {
  if (!(await currentAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const status = STATUSES.includes(sp.get("status") ?? "") ? sp.get("status")! : undefined;
  try {
    const list = await inquiriesForExport({ status, customerId: sp.get("kunde") || undefined, failedEmail: sp.get("epost") === "feilet", q: sp.get("q") ?? undefined });
    const rows: (string | number | null)[][] = [[
      "Referanse", "Innsendt (UTC)", "Kunde", "Pakke", "Pris (kr, eks. mva.)", "Avtale", "Arrangement", "Dato", "Sted", "Tidsrom",
      "Status", "Kontaktperson", "E-post", "Telefon", "Beskrivelse", "Interne notater",
    ]];
    for (const i of list) {
      const s = JSON.parse(i.snapshot) as InquirySnapshot;
      rows.push([
        i.reference, i.createdAt.toISOString(), i.customer.name, s.package?.name ?? "Annet behov",
        s.package && s.package.priceOre !== null ? `${formatPackagePrice(s.package).label} ${s.package.priceOre / 100}` : "",
        `${s.agreementLabel} (v${s.versionNumber})`, i.eventName, i.dateUnknown ? "Ikke avklart" : i.eventDate, i.locationUnknown ? "Ikke avklart" : i.location, i.timeframe,
        STATUS_LABELS[i.status] ?? i.status, i.contactName, i.contactEmail, i.contactPhone, i.description, i.internalNotes,
      ]);
    }
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="foresporsler-${todayInOslo()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logError("inquiries.export", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
