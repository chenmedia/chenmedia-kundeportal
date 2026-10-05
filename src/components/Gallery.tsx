"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "./Icons";

export interface GalleryImage { id: string; src: string; alt: string; caption: string }

/**
 * Galleri med ulik komposisjon etter antall bilder (1 = bred banner, 3 og 5 = ett stort bilde + mindre,
 * ellers rutenett). På mobil legges alt i én eller to kolonner. Klikk åpner bildet stort (native <dialog>:
 * fokusfelle, Esc lukker, piltaster bytter bilde).
 */
const LAYOUTS: Record<number, { grid: string; item: (i: number) => string }> = {
  1: { grid: "grid-cols-1", item: () => "aspect-[16/10] md:aspect-[21/9]" },
  2: { grid: "grid-cols-1 md:grid-cols-2", item: () => "aspect-[4/3]" },
  3: {
    grid: "grid-cols-2 md:grid-cols-3 md:grid-rows-2 md:h-[30rem]",
    item: (i) => (i === 0 ? "col-span-2 aspect-[16/9] md:aspect-auto md:row-span-2" : "aspect-[4/3] md:aspect-auto"),
  },
  4: { grid: "grid-cols-2 md:grid-cols-4", item: () => "aspect-[4/3] md:aspect-[3/4]" },
  5: {
    grid: "grid-cols-2 md:grid-cols-4 md:grid-rows-2 md:h-[30rem]",
    item: (i) => (i === 0 ? "col-span-2 aspect-[16/9] md:aspect-auto md:row-span-2" : "aspect-[4/3] md:aspect-auto"),
  },
  6: { grid: "grid-cols-2 md:grid-cols-3", item: () => "aspect-[4/3]" },
};

export function Gallery({ items, title }: { items: GalleryImage[]; title: string }) {
  const layout = LAYOUTS[Math.min(items.length, 6)];
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const many = items.length > 1;

  const show = useCallback((i: number) => setIndex((i + items.length) % items.length), [items.length]);

  function openAt(i: number) {
    setIndex(i);
    dialog.current?.showModal();
    document.documentElement.classList.add("modal-open");
  }

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => document.documentElement.classList.remove("modal-open");
    d.addEventListener("close", onClose);
    return () => { d.removeEventListener("close", onClose); onClose(); };
  }, []);

  const current = items[index];

  return (
    <section id="galleri" className="wrap py-10 md:py-14 gallery-section" aria-labelledby="galleri-title">
      <p className="eyebrow mb-3">Eksempler</p>
      <h2 id="galleri-title" className="section-title">{title}</h2>
      <ul className={`mt-8 grid gap-3 md:gap-4 ${layout.grid}`}>
        {items.map((g, i) => (
          <li key={g.id} className={`gallery-item relative min-h-0 overflow-hidden rounded-[20px] border border-line bg-ink ${layout.item(i)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.src} alt={g.alt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            {g.caption && <p className="gallery-caption">{g.caption}</p>}
            <button type="button" className="absolute inset-0 cursor-zoom-in" onClick={() => openAt(i)}
              aria-label={`Forstørr bilde ${i + 1} av ${items.length}${g.caption || g.alt ? `: ${g.caption || g.alt}` : ""}`} />
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        className="lightbox"
        aria-label="Bildevisning"
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
        }}
      >
        <button type="button" className="btn btn-outline btn-sm lightbox__close" onClick={() => dialog.current?.close()} aria-label="Lukk bildevisning">
          <CloseIcon /> Lukk
        </button>
        <figure className="lightbox__figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.src} alt={current.alt} className="lightbox__img" />
          {(current.caption || many) && (
            <figcaption className="lightbox__caption">
              {current.caption && <span>{current.caption}</span>}
              {many && <span role="status" className="eyebrow lightbox__count">{index + 1} / {items.length}</span>}
            </figcaption>
          )}
        </figure>
        {many && (
          <>
            <button type="button" className="btn btn-outline btn-sm lightbox__nav lightbox__nav--prev" onClick={() => show(index - 1)} aria-label="Forrige bilde">←</button>
            <button type="button" className="btn btn-outline btn-sm lightbox__nav lightbox__nav--next" onClick={() => show(index + 1)} aria-label="Neste bilde">→</button>
          </>
        )}
      </dialog>
    </section>
  );
}
