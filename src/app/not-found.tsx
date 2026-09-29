import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="wrap w-full py-8"><Logo height={40} /></div>
      <section className="wrap w-full flex-1 flex flex-col justify-center pb-24">
        <h1 className="display text-3xl md:text-5xl max-w-2xl">Denne kundesiden er ikke tilgjengelig. Kontakt Chen Media.</h1>
      </section>
    </main>
  );
}
