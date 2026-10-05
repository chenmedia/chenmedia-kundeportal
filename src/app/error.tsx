"use client";

import { Logo } from "@/components/Logo";

/** Nøytral feilside (ingen detaljer, ingen kundenavn). Gjelder kundesiden og admin. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="wrap w-full py-8"><Logo height={40} /></div>
      <section className="wrap w-full flex-1 flex flex-col justify-center items-start pb-24">
        <h1 className="display text-3xl md:text-5xl max-w-2xl">Noe gikk galt.</h1>
        <p className="ingress mt-5 max-w-xl text-[17px]">Det er ikke din feil. Prøv igjen om litt. Hvis det fortsetter, ta kontakt med Chen Media.</p>
        <button type="button" className="btn btn-dark mt-8" onClick={() => reset()}>Prøv igjen</button>
      </section>
    </main>
  );
}
