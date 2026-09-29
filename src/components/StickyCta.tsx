"use client";

import { useEffect, useState } from "react";
import { openForm } from "./form-events";
import { ArrowRight } from "./Icons";

/** Flytende knapp som dukker opp når toppseksjonen er scrollet forbi. */
export function StickyCta({ label }: { label: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
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
