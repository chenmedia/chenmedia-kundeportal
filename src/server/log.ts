/**
 * Enkel strukturert feillogging til Vercel/stdout. Logger aldri personopplysninger:
 * bare hvor det skjedde, feiltype og en kort, trunkert melding. Send aldri inn skjemadata,
 * tokens, passord eller komplette lenker som kontekst.
 */
type Ctx = Record<string, string | number | boolean | null | undefined>;

export function logError(scope: string, err: unknown, ctx: Ctx = {}) {
  const code = (err as { code?: unknown } | null)?.code;
  const target = (err as { meta?: { target?: unknown } } | null)?.meta?.target;
  // Bare våre egne feil (name «Error», f.eks. «http_500») får med meldingen. Meldinger fra Prisma, JSON.parse og zod
  // kan inneholde dataene som ble sendt inn (kontaktopplysninger, utkast, notater), så der logges bare type og kode.
  const own = err instanceof Error && err.name === "Error";
  console.error(
    JSON.stringify({
      ...ctx,
      level: "error",
      scope,
      name: err instanceof Error ? err.name : typeof err,
      code: typeof code === "string" ? code : undefined,
      target: Array.isArray(target) ? target.map(String).join(",").slice(0, 100) : typeof target === "string" ? target.slice(0, 100) : undefined,
      message: own ? (err as Error).message.replace(/\s+/g, " ").slice(0, 300) : undefined,
    }),
  );
}

export function logWarn(scope: string, message: string, ctx: Ctx = {}) {
  console.warn(JSON.stringify({ ...ctx, level: "warn", scope, message: message.slice(0, 300) }));
}
