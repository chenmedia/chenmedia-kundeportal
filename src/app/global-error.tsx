"use client";

/** Siste utvei når selve rotoppsettet feiler. Stilene lastes ikke her, så siden bruker bare innebygd CSS. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nb">
      <body style={{ margin: 0, background: "#fbf8d0", color: "#111", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "96px 24px" }}>
          <h1 style={{ fontSize: 36, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>Noe gikk galt.</h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, marginTop: 20 }}>Prøv igjen om litt. Hvis det fortsetter, ta kontakt med Chen Media.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 28, minHeight: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#111", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            Prøv igjen
          </button>
        </main>
      </body>
    </html>
  );
}
