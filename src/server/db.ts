import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./db-url";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });
if (process.env.NODE_ENV !== "production") g.prisma = db;
