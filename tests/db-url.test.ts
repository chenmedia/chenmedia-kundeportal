import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "@/server/db-url";

describe("resolveDatabaseUrl", () => {
  it("foretrekker DATABASE_URL, deretter integrasjonens variabler", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgresql://a@h/db", POSTGRES_URL: "postgresql://b@h/db" } as never)).toBe("postgresql://a@h/db");
    expect(resolveDatabaseUrl({ POSTGRES_PRISMA_URL: "postgresql://p@h/db", POSTGRES_URL: "postgresql://b@h/db" } as never)).toBe("postgresql://p@h/db");
    expect(resolveDatabaseUrl({} as never)).toBeUndefined();
  });
  it("fjerner supa-parameteren og setter pgbouncer på pooleren", () => {
    const u = new URL(resolveDatabaseUrl({ POSTGRES_URL: "postgres://u:p@aws-0-eu.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x" } as never)!);
    expect(u.searchParams.has("supa")).toBe(false);
    expect(u.searchParams.get("pgbouncer")).toBe("true");
    expect(u.searchParams.get("connection_limit")).toBe("1");
    expect(u.searchParams.get("sslmode")).toBe("require");
  });
  it("lar lokale adresser være i fred", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgresql://postgres@localhost:5433/x" } as never)).toBe("postgresql://postgres@localhost:5433/x");
  });
});
