/**
 * Enkel strukturert feillogging til Vercel/stdout. Logger aldri personopplysninger:
 * bare hvor det skjedde, feiltype og en kort, trunkert melding. Send aldri inn skjemadata,
 * tokens, passord eller komplette lenker som kontekst.
 */
type Ctx = Record<string, string | number | boolean | null | undefined>;

export function logError(scope: string, err: unknown, ctx: Ctx = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  const code = (err as { code?: unknown } | null)?.code;
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      name: e.name,
      code: typeof code === "string" ? code : undefined,
      message: e.message.replace(/\s+/g, " ").slice(0, 300),
      ...ctx,
    }),
  );
}

export function logWarn(scope: string, message: string, ctx: Ctx = {}) {
  console.warn(JSON.stringify({ level: "warn", scope, message: message.slice(0, 300), ...ctx }));
}
