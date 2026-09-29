"use client";

import { openForm } from "./form-events";
import { ArrowRight } from "./Icons";

/** Knapp på pakkekort: åpner skjemaet med pakken valgt. */
export function SelectPackageButton(props: { packageId: string; label: string; ariaLabel: string }) {
  return (
    <button type="button" className="btn btn-outline w-full group" aria-label={props.ariaLabel} onClick={() => openForm(props.packageId)}>
      {props.label}
      <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Generell knapp som åpner skjemaet. */
export function OpenFormButton({ label, variant = "accent", testId }: { label: string; variant?: "accent" | "dark" | "outline"; testId?: string }) {
  return (
    <button type="button" data-testid={testId} className={`btn btn-lg btn-${variant} group`} onClick={() => openForm()}>
      {label}
      <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
