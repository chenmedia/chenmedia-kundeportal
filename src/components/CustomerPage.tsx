import type { Content, PackageContent } from "@/lib/content";
import { DEFAULT_CTA, DEFAULT_GALLERY_TITLE, DEFAULT_INTRO } from "@/lib/content";
import { formatAddonPrice, formatDate, formatPackagePrice } from "@/lib/format";
import { Logo } from "./Logo";
import { InquiryForm } from "./InquiryForm";
import { OpenFormButton, SelectPackageButton } from "./SelectPackageButton";
import { RequestDialog } from "./RequestDialog";
import { StickyCta } from "./StickyCta";
import { PrintButton } from "./PrintButton";
import { PrintTitle } from "./PrintTitle";
import { Gallery } from "./Gallery";
import { ArrowDown, CheckIcon } from "./Icons";

export interface CustomerPageProps {
  customerName: string;
  content: Content;
  versionId: string;
  versionNumber: number;
  publishedAt: Date | null;
  mediaUrl: (assetId: string) => string;
  token?: string; // undefined = forhåndsvisning/arkiv (skjema deaktivert)
  formDisabledReason?: string;
  emailConfigured?: boolean;
}

function Included({ p }: { p: PackageContent }) {
  const items = [p.coverage, p.images, p.usage, p.delivery].filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="pkg-incl mt-6 space-y-3 text-[15px]">
      {items.map((t) => (
        <li key={t} className="flex gap-3">
          <CheckIcon className="mt-[3px] h-[18px] w-[18px] shrink-0" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function PackageCard({ p, index, mediaUrl }: { p: PackageContent; index: number; mediaUrl: (assetId: string) => string }) {
  const price = formatPackagePrice(p);
  return (
    <li className="card pkg-card overflow-hidden flex flex-col">
      {p.imageId && (
        <div className="pkg-image relative aspect-[3/2] bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(p.imageId)} alt={p.imageAlt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )}
      <div className="pkg-body p-6 md:p-7 flex flex-col flex-1">
        <div className="pkg-head flex items-start justify-between gap-4">
          <h3 className="display text-xl">{p.name}</h3>
          <span className="step-num text-muted" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="pkg-price mt-6 pt-6 hairline">
          <p className="eyebrow">{price.label}</p>
          <p className="title text-[40px] leading-none mt-2 whitespace-nowrap">{price.amount}</p>
          <p className="text-sm text-muted mt-2">eks. mva.</p>
          {p.priceNote && <p className="text-sm text-muted mt-3">{p.priceNote}</p>}
        </div>
        {p.description && <p className="pkg-desc mt-6 text-[15px]">{p.description}</p>}
        <Included p={p} />
        <div className="pkg-action mt-auto pt-8">
          <SelectPackageButton
            packageId={p.id}
            label={p.custom ? "Beskriv behovet ditt" : "Forespør denne pakken"}
            ariaLabel={`${p.custom ? "Beskriv behovet ditt" : "Forespør"} – ${p.name}`}
          />
        </div>
      </div>
    </li>
  );
}

const STEPS = [
  { t: "Velg pakke", d: "Eller beskriv behovet ditt hvis du er usikker." },
  { t: "Send forespørsel", d: "Det tar omtrent to minutter." },
  { t: "Vi tar kontakt", d: "Kai avklarer tilgjengelighet og detaljer med deg." },
];

/** Filnavn ved «Lagre som PDF», f.eks. «Chen Media - Prisliste OBOS - Prisliste V2026». */
export function pdfTitle(customerName: string, agreementLabel: string) {
  return ["Chen Media", `Prisliste ${customerName}`, agreementLabel].filter(Boolean).join(" - ");
}

export function CustomerPage(props: CustomerPageProps) {
  const { content, customerName } = props;
  const title = content.introTitle || `Eventfotografering for ${customerName}`;
  const hero = content.heroImageId ? props.mediaUrl(content.heroImageId) : null;
  const cta = content.ctaLabel || DEFAULT_CTA;

  return (
    <div>
      <PrintTitle title={pdfTitle(customerName, content.agreementLabel)} />
      <a href="#hovedinnhold" className="skip-link">Hopp til innhold</a>
      <header className="print-head wrap flex items-center justify-between gap-4 py-6">
        <Logo height={40} />
        <p className="eyebrow text-right hidden sm:block print:block">Avtale for <span className="text-ink">{customerName}</span></p>
      </header>

      <main id="hovedinnhold">
        {/* Introduksjon */}
        <section id="hero" className="wrap pt-4 pb-10 md:pb-14" aria-labelledby="intro-title">
          <div className="grid gap-10 lg:gap-14 lg:grid-cols-[1.35fr_1fr] items-center">
            <div className="min-w-0">
              <p className="eyebrow mb-5">Eventfotografering · {customerName}</p>
              <h1 id="intro-title" className="display hero-title">{title}</h1>
              <p className="ingress text-[17px] md:text-[18px] mt-6 max-w-[34rem]">{content.introText || DEFAULT_INTRO}</p>
              <div className="hero-actions mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <OpenFormButton label={cta} testId="open-form" />
                <a href="#pakker" className="link font-semibold inline-flex items-center gap-1.5 min-h-[44px]">
                  Se pakker og priser <ArrowDown className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="hero-media relative aspect-[16/9] lg:aspect-[4/3] rounded-[28px] overflow-hidden border border-line bg-ink">
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hero} alt={content.heroImageAlt || `Bilde fra et event fotografert av Chen Media for ${customerName}`} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div role="img" aria-label="Plassholder for eventbilde" className="absolute inset-0">
                  {/* Krusedullen: stor og beskåret i hjørnet, 100 % hvit */}
                  <div className="absolute -right-[14%] -top-[16%] w-[42%] lg:w-[56%]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/mark-white.png" alt="" aria-hidden="true" className="block h-auto w-full" />
                  </div>
                  <p className="display absolute left-5 bottom-5 lg:left-6 lg:bottom-6 text-white text-xl sm:text-2xl lg:text-3xl max-w-[12ch]">Vi fanger øyeblikkene</p>
                </div>
              )}
            </div>
          </div>

          {/* Fakta */}
          <dl className="mt-12 grid md:grid-cols-3 card overflow-hidden">
            <div className="fact"><dt className="eyebrow">Avtale</dt><dd className="title text-lg mt-1">{content.agreementLabel || "Utkast"}</dd></div>
            <div className="fact"><dt className="eyebrow">Publisert</dt><dd className="title text-lg mt-1">{props.publishedAt ? formatDate(props.publishedAt) : "Ikke publisert"}</dd></div>
            <div className="fact"><dt className="eyebrow">Kontaktperson</dt><dd className="title text-lg mt-1">{content.contactName || "Chen Media"}</dd></div>
          </dl>
        </section>

        {/* Pakker */}
        <section id="pakker" className="packages-section wrap py-10 md:py-14 scroll-mt-6" aria-labelledby="pakker-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-3">Deres avtalte pakker</p>
              <h2 id="pakker-title" className="section-title">Velg pakke</h2>
            </div>
            <p className="text-muted max-w-sm text-[15px]">Alle priser er oppgitt eks. mva. Ingen forpliktelse før du har fått bekreftelse fra oss.</p>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3 items-stretch">
            {content.packages.map((p, i) => <PackageCard key={p.id} p={p} index={i} mediaUrl={props.mediaUrl} />)}
          </ul>
        </section>

        {/* Bilder fra oppdrag */}
        {content.gallery.length > 0 && (
          <Gallery
            items={content.gallery.map((g) => ({ id: g.id, src: props.mediaUrl(g.imageId), alt: g.alt, caption: g.caption }))}
            title={content.galleryTitle || DEFAULT_GALLERY_TITLE}
          />
        )}

        {/* Tillegg og praktisk */}
        {(content.addons.length > 0 || content.practical.length > 0) && (
          <section className="addons-section wrap py-10 md:py-14 grid grid-cols-1 gap-5 md:grid-cols-5" aria-labelledby="tillegg-title">
            {content.addons.length > 0 && (
              <div className="addons-card card min-w-0 p-5 md:p-8 md:col-span-3">
                <p className="eyebrow mb-3">Ved behov</p>
                <h2 id="tillegg-title" className="section-title">Tillegg</h2>
                <table className="tbl mt-5 text-[15px]">
                  <caption className="sr-only">Tillegg og priser eks. mva.</caption>
                  <thead className="sr-only"><tr><th>Tillegg</th><th>Pris</th></tr></thead>
                  <tbody>
                    {content.addons.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="font-semibold">{a.name}</span>
                          {a.note && <span className="block text-sm text-muted">{a.note}</span>}
                        </td>
                        <td className="text-right sm:whitespace-nowrap mono-num text-[13px] sm:text-[14px]">{formatAddonPrice(a)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {content.practical.length > 0 && (
              <div className="practical-card min-w-0 p-5 md:p-8 md:col-span-2 rounded-[20px] bg-ink text-white on-dark flex flex-col">
                <p className="eyebrow eyebrow-dark mb-3">Godt å vite</p>
                <h2 className="section-title">Praktisk</h2>
                <ul className="mt-5 space-y-3 text-[15px]">
                  {content.practical.map((t) => (
                    <li key={t} className="flex gap-3">
                      <CheckIcon className="mt-[3px] h-[18px] w-[18px] shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-white/75 mt-6">Tillegg avklares i det endelige tilbudet. Skjemaet beregner ingen totalsum.</p>
                {content.contactEmail && (
                  <div className="practical-contact mt-auto pt-8">
                    <div className="border-t border-white/20 pt-5">
                      <p className="eyebrow eyebrow-dark">Spørsmål om avtalen?</p>
                      <p className="mt-2 text-[15px]">
                        Kontakt {content.contactName || "Chen Media"}:{" "}
                        <a href={`mailto:${content.contactEmail}`} className="underline underline-offset-4 decoration-accent decoration-2 break-all">{content.contactEmail}</a>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Slik går det til + oppfordring */}
        <section className="wrap py-10 md:py-14 no-print" aria-labelledby="steg-title">
          <div className="card p-6 md:p-10">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-14 items-center">
              <div>
                <p className="eyebrow mb-3">Ingen hast?</p>
                <h2 id="steg-title" className="section-title">Bruk siden som prisliste</h2>
                <p className="ingress mt-4 text-[16px]">
                  Ikke alle trenger å booke med en gang. Når behovet er der, sender du en forespørsel herfra, så slipper du å lete etter e-poster.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <OpenFormButton label={cta} variant="dark" />
                  <PrintButton />
                </div>
              </div>
              <ol className="grid gap-4">
                {STEPS.map((s, i) => (
                  <li key={s.t} className="flex gap-5 items-start rounded-2xl bg-cream/60 border border-line p-5">
                    <span className="step-num mt-1">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="title">{s.t}</p>
                      <p className="text-[15px] text-muted mt-0.5">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer bg-ink text-white on-dark">
        <div className="footer-grid wrap py-12 grid gap-10 md:grid-cols-3">
          <div className="footer-brand">
            <Logo variant="white" height={38} />
            <p className="mt-4 text-sm text-white/80">Eventfoto og film for bedrifter.</p>
          </div>
          <div>
            <h2 className="eyebrow eyebrow-dark">Spørsmål? Kontakt {content.contactName || "Chen Media"}</h2>
            {content.contactEmail && (
              <p className="mt-3">
                <a href={`mailto:${content.contactEmail}`} className="underline underline-offset-4 decoration-accent decoration-2 break-all">{content.contactEmail}</a>
              </p>
            )}
            <p className="footer-version eyebrow eyebrow-dark mt-6">Avtaleversjon</p>
            <p className="footer-version mt-2 text-sm">
              {content.agreementLabel || "Utkast"}
              {props.publishedAt && <> · publisert {formatDate(props.publishedAt)}</>}
            </p>
            {content.validityText && <p className="mt-1 text-sm text-white/80">{content.validityText}</p>}
          </div>
          <div className="no-print">
            <h2 className="eyebrow eyebrow-dark">Personvern</h2>
            <p className="mt-3 text-sm text-white/85">
              Opplysningene du sender inn i skjemaet brukes til å følge opp fotobehovet ditt hos Chen Media.
              Kontaktadressen vises slik at du kan ta kontakt direkte. Har du spørsmål om hvordan opplysningene behandles,
              kan du skrive til oss.
            </p>
          </div>
        </div>
      </footer>

      <StickyCta label={cta} />

      <RequestDialog customerName={customerName}>
        <InquiryForm
          token={props.token}
          versionId={props.versionId}
          packages={content.packages.map((p) => { const pr = formatPackagePrice(p); return { id: p.id, name: p.name, custom: p.custom, priceText: `${pr.label} ${pr.amount} eks. mva.` }; })}
          disabledReason={props.formDisabledReason}
          emailConfigured={!!props.emailConfigured}
          contactEmail={content.contactEmail}
        />
      </RequestDialog>
    </div>
  );
}
