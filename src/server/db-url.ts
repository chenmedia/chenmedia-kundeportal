/**
 * Finner databaseadressen. DATABASE_URL har forrang. På Vercel med Supabase-integrasjonen brukes
 * POSTGRES_PRISMA_URL (pooler, laget for Prisma) eller POSTGRES_URL.
 * Fjerner parametere Prisma ikke kjenner (`supa=`) og sørger for pgbouncer-innstillinger på pooleren.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    u.searchParams.delete("supa");
    if (u.port === "6543" || u.hostname.includes("pooler.supabase.com")) {
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
    }
    return u.toString();
  } catch {
    return raw;
  }
}
