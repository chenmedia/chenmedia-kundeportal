import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { formatAddonPrice, formatCalendarDate, formatDateTime, formatPackagePrice, InquirySnapshot } from "@/lib/content";
import { StatusBadge, EMAIL_STATUS } from "@/components/AdminBits";
import { DeleteForm, StatusForm } from "@/components/InquiryAdminForms";
import { retryEmailAction } from "../../actions";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (<><dt className="eyebrow pt-1">{k}</dt><dd className="min-w-0 break-words">{children}</dd></>);
}

export default async function InquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const i = await db.inquiry.findUnique({ where: { id }, include: { customer: true, version: true, emailJobs: { orderBy: { createdAt: "asc" } } } });
  if (!i) notFound();
  const s = JSON.parse(i.snapshot) as InquirySnapshot;
  const price = s.package ? formatPackagePrice(s.package) : null;

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin/foresporsler" className="link text-sm">← Til forespørslene</Link>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <h1 className="display text-3xl">{i.eventName}</h1>
          <StatusBadge status={i.status} />
        </div>
        <p className="mt-1 text-muted">{i.customer.name} · <span className="mono-num">{i.reference}</span> · innsendt {formatDateTime(i.createdAt)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="card p-6 min-w-0" aria-labelledby="innsendt">
          <h2 id="innsendt" className="title text-lg">Innsendte opplysninger</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr] text-[15px]">
            <Row k="Pakke">{s.package ? s.package.name : "Usikker / annet behov"}</Row>
            <Row k="Dato">{i.dateUnknown || !i.eventDate ? "Dato er ikke avklart" : formatCalendarDate(i.eventDate)}</Row>
            <Row k="Sted">{i.locationUnknown || !i.location ? "Sted er ikke avklart" : i.location}</Row>
            {i.timeframe && <Row k="Tidsrom">{i.timeframe}</Row>}
            <Row k="Beskrivelse"><span className="whitespace-pre-wrap">{i.description}</span></Row>
            <Row k="Ekspress">{i.express ? "Ønsker levering innen 24 timer" : "Nei"}</Row>
            <Row k="Trykk">{i.printUse ? "Ønsker å avklare bruk av bilder i trykk" : "Nei"}</Row>
            <Row k="Kontakt">{i.contactName}</Row>
            <Row k="E-post"><a className="link" href={`mailto:${i.contactEmail}`}>{i.contactEmail}</a></Row>
            {i.contactPhone && <Row k="Telefon">{i.contactPhone}</Row>}
          </dl>
        </section>

        <section className="card p-6 min-w-0" aria-labelledby="snap">
          <h2 id="snap" className="title text-lg">Pris slik kunden så den</h2>
          <p className="text-sm text-muted mt-1">{s.agreementLabel} · versjon {s.versionNumber}. Endres ikke av senere publiseringer.</p>
          {s.package ? (
            <div className="mt-4 text-[15px]">
              <p className="font-semibold">{s.package.name}</p>
              <p className="mono-num">{price!.label} {price!.amount} eks. mva.</p>
              {s.package.priceNote && <p className="text-muted">{s.package.priceNote}</p>}
              <ul className="list-disc pl-5 mt-2">
                {[s.package.coverage, s.package.images, s.package.usage, s.package.delivery, s.package.description].filter(Boolean).map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          ) : <p className="mt-4 text-[15px]">Ingen pakke valgt.</p>}
          {s.addons.length > 0 && (
            <details className="mt-4 text-[15px]">
              <summary className="cursor-pointer font-semibold">Tillegg og vilkår ({s.addons.length + s.practical.length})</summary>
              <ul className="mt-2 space-y-1">
                {s.addons.map((a) => <li key={a.id}>{a.name}: <span className="mono-num">{formatAddonPrice(a)}</span></li>)}
                {s.practical.map((t) => <li key={t} className="text-muted">{t}</li>)}
              </ul>
            </details>
          )}
        </section>
      </div>

      <section className="card p-6" aria-labelledby="oppfolging">
        <h2 id="oppfolging" className="title text-lg mb-4">Oppfølging</h2>
        <StatusForm id={i.id} status={i.status} notes={i.internalNotes} />
      </section>

      <section className="card p-6" aria-labelledby="epost">
        <h2 id="epost" className="title text-lg">E-post</h2>
        <ul className="mt-3 divide-y divide-line">
          {i.emailJobs.map((j) => (
            <li key={j.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-semibold">{j.type === "team_notification" ? "Varsel til Chen Media" : "Kvittering til kunden"}</span>
              <span className="text-sm text-muted">{j.recipient}</span>
              <span className={`badge ${j.status === "failed" ? "!border-err !text-err" : ""}`}>{EMAIL_STATUS[j.status] ?? j.status}</span>
              <span className="text-sm text-muted">{j.attempts} forsøk{j.errorCategory ? ` · feil: ${j.errorCategory}` : ""}</span>
              {j.status === "failed" && (
                <form action={retryEmailAction.bind(null, j.id, i.id)}><button className="btn btn-dark btn-sm">Prøv på nytt</button></form>
              )}
            </li>
          ))}
        </ul>
        {i.emailJobs.some((j) => j.status === "local_preview") && (
          <p className="text-sm mt-2">E-postene er bare forhåndsvist lokalt. Se <Link className="link" href="/admin/utboks">E-postutboksen</Link>.</p>
        )}
      </section>

      <section className="card p-6" aria-labelledby="slett">
        <h2 id="slett" className="title text-lg mb-3">Slett forespørsel</h2>
        <DeleteForm id={i.id} />
      </section>
    </div>
  );
}
