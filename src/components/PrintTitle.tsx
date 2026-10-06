"use client";

import { useEffect } from "react";

/**
 * Nettleseren bruker sidetittelen som filnavn når prislisten lagres som PDF. Tittelen på siden er bevisst nøytral
 * (lenkeforhåndsvisning) eller «Administrasjon» i admin, så den byttes bare mens utskriftsdialogen er åpen.
 */
export function PrintTitle({ title }: { title: string }) {
  useEffect(() => {
    let original: string | null = null;
    const before = () => {
      if (original === null) original = document.title;
      document.title = title;
    };
    const after = () => {
      if (original !== null) document.title = original;
      original = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, [title]);
  return null;
}
