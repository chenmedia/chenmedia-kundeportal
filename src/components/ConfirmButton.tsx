"use client";

/** Submit-knapp som ber om bekreftelse først. Brukes i skjemaer med server-handlinger som ikke kan angres lett. */
export function ConfirmButton({ message, className, ariaLabel, children }: { message: string; className?: string; ariaLabel?: string; children: React.ReactNode }) {
  return (
    <button className={className} aria-label={ariaLabel} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
