/**
 * Offentlig adresse. APP_URL har forrang. Mangler den på Vercel i produksjon, brukes prosjektets produksjonsadresse
 * i stedet for localhost (ellers ville «Kopier lenke» gitt lenker som ikke virker for kunden).
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.NODE_ENV === "production" && prod) return `https://${prod}`;
  return "http://localhost:3000";
}
