import type { Content, PackageContent } from "@/lib/content";
import { DEFAULT_CTA, DEFAULT_INTRO, formatAddonPrice, formatDate, formatPackagePrice } from "@/lib/content";
import { Logo, Mark } from "./Logo";
import { InquiryForm } from "./InquiryForm";
import { SelectPackageButton, ScrollToForm } from "./SelectPackageButton";

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
    <ul className="mt-6 space-y-3 text-[15px]">
      {items.map((t) => (
        <li key={t} className="flex gap-3">
          <span aria-hidden="true" className="mt-[10px] h-[6px] w-[6px] rounded-full bg-ink shrink-0" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function PackageCard({ p, disabled }: { p: PackageContent; disabled: boolean }) {
  const price = formatPackagePrice(p);
  return (
    <li className="card p-6 md:p-7 flex flex-col">
      <h3 className="display text-xl">{p.name}</h3>
      <div className="mt-5">
        <p className="eyebrow">{price.label}</p>
        <p className="title text-4xl mt-1 whitespace-nowrap">{price.amount}</p>
        <p className="text-sm text-muted mt-1">eks. mva.</p>
        {p.priceNote && <p className="text-sm text-muted mt-2">{p.priceNote}</p>}
      </div>
      {p.description && <p className="mt-6 text-[15px]">{p.description}</p>}
      <Included p={p} />
      <div className="mt-auto pt-8">
        <SelectPackageButton
          packageId={p.id}
          label={p.custom ? "Beskriv behovet ditt" : "Forespør denne pakken"}
          ariaLabel={`${p.custom ? "Beskriv behovet ditt" : "Forespør"} – ${p.name}`}
          disabled={disabled}
          primary={false}
        />
      </div>
    </li>
  );
}

export function CustomerPage(props: CustomerPageProps) {
  const { content, customerName } = props;
  const disabled = !props.token;
  const title = content.introTitle || `Eventfotografering for ${customerName}`;
  const hero = content.heroImageId ? props.mediaUrl(content.heroImageId) : null;

  return (
    <div>
      <a href="#hovedinnhold" className="skip-link">Hopp til innhold</a>
      <header className="wrap flex items-center justify-between gap-4 py-6">
        <Logo height={40} />
        <p className="eyebrow text-right">Avtale for <span className="text-ink">{customerName}</span></p>
      </header>

      <main id="hovedinnhold">
        {/* Introduksjon */}
        <section className="wrap grid gap-8 lg:gap-12 lg:grid-cols-[1.35fr_1fr] items-center pt-4 pb-12 md:pb-16" aria-labelledby="intro-title">
          <div className="min-w-0">
            <p className="eyebrow mb-4">Eventfotografering · {customerName}</p>
            <h1 id="intro-title" className="display hero-title">{title}</h1>
            <p className="ingress text-[17px] mt-6 max-w-[34rem]">{content.introText || DEFAULT_INTRO}</p>
            <div className="mt-8">
              <ScrollToForm label={content.ctaLabel || DEFAULT_CTA} disabled={disabled} />
            </div>
          </div>
          <div className="relative aspect-[4/3] rounded-[24px] overflow-hidden border border-line bg-paper">
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt={content.heroImageAlt || `Bilde fra et event fotografert av Chen Media for ${customerName}`} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-ink" role="img" aria-label="Plassholder for eventbilde">
                <Mark variant="white" height={120} />
              </div>
            )}
          </div>
        </section>

        {/* Pakker */}
        <section className="wrap pb-12 md:pb-16" aria-labelledby="pakker-title">
          <h2 id="pakker-title" className="display text-2xl md:text-3xl">Pakker</h2>
          <p className="text-muted mt-2">Alle priser er oppgitt eks. mva.</p>
          <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {content.packages.map((p) => <PackageCard key={p.id} p={p} disabled={disabled} />)}
          </ul>
        </section>

        {/* Tillegg og praktisk */}
        {(content.addons.length > 0 || content.practical.length > 0) && (
          <section className="wrap pb-12 md:pb-16 grid grid-cols-1 gap-5 md:grid-cols-5" aria-labelledby="tillegg-title">
            {content.addons.length > 0 && (
              <div className="card min-w-0 p-5 md:p-7 md:col-span-3">
                <h2 id="tillegg-title" className="display text-xl">Tillegg</h2>
                <table className="tbl mt-4 text-[15px]">
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
              <div className="card min-w-0 p-5 md:p-7 md:col-span-2">
                <h2 className="display text-xl">Praktisk</h2>
                <ul className="mt-4 space-y-3 text-[15px]">
                  {content.practical.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span aria-hidden="true" className="mt-[10px] h-[6px] w-[6px] rounded-full bg-ink shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted mt-5">
                  Tillegg avklares i det endelige tilbudet. Skjemaet under beregner ingen totalsum.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Skjema */}
        <section className="wrap pb-16 md:pb-24" aria-labelledby="foresporsel-heading">
          <div className="card p-6 md:p-10">
            <InquiryForm
              token={props.token}
              versionId={props.versionId}
              packages={content.packages.map((p) => ({ id: p.id, name: p.name, custom: p.custom }))}
              disabledReason={props.formDisabledReason}
              emailConfigured={!!props.emailConfigured}
              contactEmail={content.contactEmail}
            />
          </div>
        </section>
      </main>

      <footer className="bg-ink text-white on-dark">
        <div className="wrap py-12 grid gap-10 md:grid-cols-3">
          <div>
            <Logo variant="white" height={38} />
            <p className="mt-4 text-sm text-white/80">Eventfoto og film for bedrifter.</p>
          </div>
          <div>
            <h2 className="eyebrow !text-white/70">Spørsmål? Kontakt {content.contactName || "Chen Media"}</h2>
            {content.contactEmail && (
              <p className="mt-3">
                <a href={`mailto:${content.contactEmail}`} className="underline underline-offset-4 decoration-accent decoration-2 break-all">{content.contactEmail}</a>
              </p>
            )}
            <p className="eyebrow !text-white/70 mt-6">Avtaleversjon</p>
            <p className="mt-2 text-sm">
              {content.agreementLabel || "Utkast"}
              {props.publishedAt && <> · publisert {formatDate(props.publishedAt)}</>}
            </p>
            {content.validityText && <p className="mt-1 text-sm text-white/80">{content.validityText}</p>}
          </div>
          <div>
            <h2 className="eyebrow !text-white/70">Personvern</h2>
            <p className="mt-3 text-sm text-white/85">
              Opplysningene du sender inn i skjemaet brukes til å følge opp fotobehovet ditt hos Chen Media.
              Kontaktadressen vises slik at du kan ta kontakt direkte. Har du spørsmål om hvordan opplysningene behandles,
              kan du skrive til oss.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
