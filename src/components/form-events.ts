/** Hendelser mellom knapper på kundesiden og skjemadialogen. */
export const OPEN_EVENT = "cm:open-form";
export const SELECT_EVENT = "cm:select-package";

/** Åpner forespørselsskjemaet, valgfritt med forhåndsvalgt pakke. */
export function openForm(packageId?: string) {
  if (packageId) window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: packageId }));
  window.dispatchEvent(new Event(OPEN_EVENT));
}
