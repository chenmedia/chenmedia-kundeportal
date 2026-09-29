/**
 * Passordsjekk mot Supabase Auth. Brukes bare til å verifisere legitimasjon.
 * Hvem som er administrator bestemmes av AdminUser-tabellen (godkjenningsliste), ikke av Supabase alene.
 */
function anonKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined;
}

export function supabaseAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.SUPABASE_URL && anonKey(env));
}

export async function verifyWithSupabase(email: string, password: string): Promise<{ ok: boolean }> {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "") + "/auth/v1";
  const key = anonKey()!;
  let res: Response;
  try {
    res = await fetch(`${base}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false };
  }
  if (!res.ok) return { ok: false };
  const data = (await res.json().catch(() => null)) as { access_token?: string; user?: { email?: string; email_confirmed_at?: string | null } } | null;
  const user = data?.user;
  const valid = !!data?.access_token && !!user?.email_confirmed_at && user.email?.toLowerCase() === email.toLowerCase();
  // Ryd opp: vi bruker ikke Supabase-sesjonen, bare verifiseringen.
  if (data?.access_token) {
    void fetch(`${base}/logout?scope=local`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${data.access_token}` } }).catch(() => undefined);
  }
  return { ok: valid };
}
