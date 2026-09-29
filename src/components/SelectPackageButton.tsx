"use client";

export const SELECT_EVENT = "cm:select-package";

export function focusForm() {
  const h = document.getElementById("foresporsel-heading");
  if (h) {
    h.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
  }
}

export function SelectPackageButton(props: {
  packageId: string;
  label: string;
  ariaLabel: string;
  disabled: boolean;
  primary: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn ${props.primary ? "btn-accent" : "btn-outline"} w-full`}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onClick={() => {
        window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: props.packageId }));
        focusForm();
      }}
    >
      {props.label}
    </button>
  );
}

export function ScrollToForm({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <button type="button" className="btn btn-accent" disabled={disabled} onClick={focusForm}>
      {label} <span aria-hidden="true">→</span>
    </button>
  );
}
