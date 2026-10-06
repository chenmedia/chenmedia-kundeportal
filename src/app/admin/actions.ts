"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SESSION_COOKIE, login, logout, requireAdmin } from "@/server/admin-auth";
import { clientIp } from "@/server/rate-limit";
import { parseContactForm } from "@/lib/customer-contact";
import { DraftConflictError, addPortal, assetsBelongToCustomer, createCustomer, updateCustomerContact, duplicateCustomer, publish, restoreVersionAsDraft, rotateToken, saveDraft, setActive } from "@/server/customers";
import { deleteInquiry, deleteInquiriesByEmail, updateInquiryFollowUp } from "@/server/inquiries";
import { contentImageIds, contentSchema, isEmail } from "@/lib/content";
import { STATUSES } from "@/lib/inquiry";
import { PORTAL_KINDS, isPortalKind, PORTALS, type PortalKind } from "@/lib/portal";
import { processJob } from "@/server/email";
import { logError } from "@/server/log";

export interface ActionState { ok?: boolean; message?: string; updatedAt?: string; conflict?: boolean; error?: string; problems?: string[]; fieldErrors?: Record<string, string>; values?: Record<string, string> }

function formValues(fd: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Skriv inn e-post og passord." };
  const ip = clientIp(await headers());
  const r = await login(email, password, ip);
  if (!r.ok) {
    return { error: r.error === "rate" ? "For mange forsøk. Vent 15 minutter og prøv igjen." : "Feil e-post eller passord." };
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, r.token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: r.maxAge,
  });
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function createCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  // React nullstiller skjemaet etter en handling, så innskrevne verdier sendes tilbake og settes som defaultValue.
  const values = { ...formValues(fd, ["name", "contactName", "contactEmail", "contactPhone"]), portals: fd.getAll("portals").join(",") };
  const contact = parseContactForm(fd);
  const fieldErrors: Record<string, string> = {};
  const kinds = PORTAL_KINDS.filter((k) => fd.getAll("portals").includes(k));
  if (name.length < 2) fieldErrors.name = "Skriv kundenavn (minst 2 tegn).";
  if (kinds.length === 0) fieldErrors.portals = "Velg minst én portal.";
  if (!contact.ok) Object.assign(fieldErrors, contact.fieldErrors);
  if (Object.keys(fieldErrors).length || !contact.ok) return { error: "Rett opp feltene under.", fieldErrors, values };
  let id: string;
  try {
    id = (await createCustomer(name, contact.ok ? contact.contact : undefined, kinds)).id;
  } catch (e) {
    logError("customer.create", e);
    const missingSecret = e instanceof Error && e.message.includes("APP_SECRET");
    return { error: missingSecret ? "Serveren mangler APP_SECRET. Sett den i Vercel og redeploy." : "Kunne ikke opprette kunden. Prøv igjen." };
  }
  redirect(`/admin/kunder/${id}`);
}

const kindParam = (kind: string): PortalKind | null => (isPortalKind(kind) ? kind : null);

export async function saveDraftAction(customerId: string, kind: string, name: string, contentJson: string, expectedUpdatedAt?: string | null): Promise<ActionState> {
  await requireAdmin();
  const k = kindParam(kind);
  if (!k) return { error: "Ukjent portal." };
  const nm = name.trim();
  if (nm.length < 1) return { error: "Kundenavn kan ikke være tomt." };
  let parsed;
  try {
    parsed = contentSchema.parse(JSON.parse(contentJson));
  } catch {
    return { error: "Innholdet er ugyldig. Kontroller feltene og prøv igjen." };
  }
  // Bilder må tilhøre denne kunden.
  if (!(await assetsBelongToCustomer(contentImageIds(parsed), customerId))) return { error: "Et av bildene tilhører ikke denne kunden." };
  let saved: { updatedAt: Date };
  try {
    saved = await saveDraft(customerId, nm, parsed, expectedUpdatedAt, k);
  } catch (e) {
    if (e instanceof DraftConflictError) {
      return { conflict: true, error: "Utkastet er lagret av noen andre (eller i en annen fane) siden du åpnet siden. Last siden på nytt for å se endringene, eller lagre og overskriv dem." };
    }
    logError("customer.save-draft", e, { customerId, kind: k });
    return { error: "Kunne ikke lagre utkastet. Endringene dine er fortsatt her. Prøv igjen." };
  }
  revalidatePath(`/admin/kunder/${customerId}`);
  return { ok: true, updatedAt: saved.updatedAt.toISOString() };
}

export async function publishAction(customerId: string, kind: string): Promise<ActionState> {
  await requireAdmin();
  const k = kindParam(kind);
  if (!k) return { error: "Ukjent portal." };
  try {
    const r = await publish(customerId, k);
    if (!r.ok) return { error: "Kan ikke publisere ennå.", problems: r.problems };
  } catch (e) {
    logError("customer.publish", e, { customerId, kind: k });
    return { error: "Publiseringen feilet. Ingenting er endret. Prøv igjen." };
  }
  revalidatePath(`/admin/kunder/${customerId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function rotateTokenAction(customerId: string): Promise<ActionState> {
  await requireAdmin();
  try {
    await rotateToken(customerId);
  } catch (e) {
    logError("customer.rotate-token", e, { customerId });
    return { error: "Kunne ikke generere ny lenke. Sjekk at APP_SECRET er satt." };
  }
  revalidatePath(`/admin/kunder/${customerId}`);
  return { ok: true };
}

export async function setActiveAction(customerId: string, active: boolean): Promise<ActionState> {
  await requireAdmin();
  try {
    await setActive(customerId, active);
  } catch (e) {
    logError("customer.set-active", e, { customerId });
    return { error: "Kunne ikke endre tilgangen. Prøv igjen." };
  }
  revalidatePath(`/admin/kunder/${customerId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function duplicateAction(customerId: string): Promise<void> {
  await requireAdmin();
  let id: string;
  try {
    id = (await duplicateCustomer(customerId)).id;
  } catch (e) {
    logError("customer.duplicate", e, { customerId });
    // Brukes som skjemahandling uten plass til feilmelding: feilsiden (error.tsx) viser «Prøv igjen».
    throw new Error("Kunne ikke duplisere kunden.");
  }
  redirect(`/admin/kunder/${id}`);
}

const inquiryUpdate = z.object({ status: z.string().refine((s) => STATUSES.includes(s)), notes: z.string().max(10000) });

export async function updateInquiryAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const p = inquiryUpdate.safeParse({ status: fd.get("status"), notes: String(fd.get("notes") ?? "") });
  if (!p.success) return { error: "Ugyldig status eller notat." };
  try {
    await updateInquiryFollowUp(id, p.data.status, p.data.notes);
  } catch (e) {
    logError("inquiry.update", e, { inquiryId: id });
    return { error: "Kunne ikke lagre. Prøv igjen." };
  }
  revalidatePath(`/admin/foresporsler/${id}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteInquiryAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (fd.get("confirm") !== "on") return { error: "Kryss av for å bekrefte at forespørselen skal slettes." };
  try {
    await deleteInquiry(id);
  } catch (e) {
    logError("inquiry.delete", e, { inquiryId: id });
    return { error: "Kunne ikke slette forespørselen. Prøv igjen." };
  }
  redirect("/admin/foresporsler");
}

export async function retryEmailAction(jobId: string, inquiryId: string): Promise<void> {
  await requireAdmin();
  try {
    await processJob(jobId);
  } catch (e) {
    logError("email.retry", e, { jobId });
  }
  revalidatePath(`/admin/foresporsler/${inquiryId}`);
  revalidatePath("/admin");
}

export async function updateContactAction(customerId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const contact = parseContactForm(fd);
  if (!contact.ok) return { error: "Rett opp feltene under.", fieldErrors: contact.fieldErrors, values: formValues(fd, ["contactName", "contactEmail", "contactPhone"]) };
  try {
    await updateCustomerContact(customerId, contact.contact);
  } catch (e) {
    logError("customer.contact", e, { customerId });
    return { error: "Kunne ikke lagre kontaktpersonen. Prøv igjen." };
  }
  revalidatePath(`/admin/kunder/${customerId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteByEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const email = String(fd.get("email") ?? "").trim();
  if (!isEmail(email)) return { error: "Skriv en gyldig e-postadresse.", values: { email } };
  if (fd.get("confirm") !== "on") return { error: "Kryss av for å bekrefte at alt fra denne adressen skal slettes.", values: { email } };
  let count: number;
  try {
    count = await deleteInquiriesByEmail(email);
  } catch (e) {
    logError("inquiry.delete-by-email", e);
    return { error: "Kunne ikke slette. Prøv igjen.", values: { email } };
  }
  revalidatePath("/admin/foresporsler");
  revalidatePath("/admin");
  return { ok: true, message: count === 0 ? "Fant ingen forespørsler fra denne adressen." : `Slettet ${count} ${count === 1 ? "forespørsel" : "forespørsler"} med tilhørende e-postjobber.` };
}

export async function restoreVersionAction(customerId: string, kind: string, versionNumber: number): Promise<void> {
  await requireAdmin();
  const k = kindParam(kind);
  if (!k || !Number.isInteger(versionNumber) || versionNumber < 1) return;
  if (!(await restoreVersionAsDraft(customerId, versionNumber, k))) return;
  revalidatePath(`/admin/kunder/${customerId}`);
  redirect(`/admin/kunder/${customerId}?tjeneste=${PORTALS[k].slug}&gjenopprettet=${versionNumber}`);
}

/** Legger til en portal (f.eks. eventfilm) hos en eksisterende kunde. Utkastet er tomt og upublisert. */
export async function addPortalAction(customerId: string, kind: string): Promise<void> {
  await requireAdmin();
  const k = kindParam(kind);
  if (!k) throw new Error("Ukjent portal.");
  try {
    await addPortal(customerId, k);
  } catch (e) {
    logError("customer.add-portal", e, { customerId, kind: k });
    throw new Error("Kunne ikke opprette portalen.");
  }
  revalidatePath(`/admin/kunder/${customerId}`);
  revalidatePath("/admin");
  redirect(`/admin/kunder/${customerId}?tjeneste=${PORTALS[k].slug}`);
}
