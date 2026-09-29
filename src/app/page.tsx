import { Logo, Mark } from "@/components/Logo";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="wrap w-full py-8"><Logo height={44} /></div>
      <section className="wrap w-full flex-1 flex flex-col justify-center pb-24">
        <p className="eyebrow mb-4">Foto &amp; video · 2026</p>
        <h1 className="display text-4xl md:text-6xl max-w-3xl">Vi fanger øyeblikkene</h1>
        <p className="ingress text-lg mt-6 max-w-xl">
          Eventfoto og film for bedrifter. Har du fått en personlig lenke til prisene dine, åpner du den direkte.
        </p>
        <div className="mt-10"><Mark height={56} /></div>
      </section>
    </main>
  );
}
