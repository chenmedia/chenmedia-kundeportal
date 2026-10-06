"use client";

import { useEffect, useState } from "react";
import { openForm } from "./form-events";
import { ArrowRight } from "./Icons";

/**
 * Flytende knapp som dukker opp når toppseksjonen er scrollet forbi, og skjules igjen når bunnfeltet er synlig
 * (ellers dekker den bunnteksten, og fokusringen forsvinner mot den svarte flaten).
 */
export function StickyCta({ label }: { label: string }) {
  const [pastHero, setPastHero] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  const show = pastHero && !atFooter;

  useEffect(() => {
    const hero = document.getElementById("hero");
    const footer = document.querySelector(".site-footer");
    const ios: IntersectionObserver[] = [];
    if (hero) {
      const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { threshold: 0 });
      io.observe(hero);
      ios.push(io);
    }
    if (footer) {
      const io = new IntersectionObserver(([e]) => setAtFooter(e.isIntersecting), { threshold: 0 });
      io.observe(footer);
      ios.push(io);
    }
    return () => ios.forEach((io) => io.disconnect());
  }, []);

  return (
    <div className={`sticky-cta ${show ? "sticky-cta--on" : ""}`} inert={!show}>
      <button type="button" className="btn btn-accent btn-lg group shadow-lg" onClick={() => openForm()}>
        {label}
        <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
