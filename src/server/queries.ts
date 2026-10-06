/**
 * Lesemodeller for administrasjonen. Sider og API-ruter henter data herfra i stedet for å
 * kalle databasen direkte, slik at spørringer ligger på ett sted og kan gjenbrukes.
 */
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export interface NewInquirySnapshot {
  newCount: number;
  latest: { id: string; eventName: string; customerName: string; createdAt: string }[];
}

/** Antall nye forespørsler og de nyeste. Brukes av menyteller og varsling. */
export async function newInquirySnapshot(take = 5): Promise<NewInquirySnapshot> {
  const [newCount, latest] = await Promise.all([
    db.inquiry.count({ where: { status: "new" } }),
    db.inquiry.findMany({
      where: { status: "new" }, orderBy: { createdAt: "desc" }, take,
      select: { id: true, eventName: true, createdAt: true, customer: { select: { name: true } } },
    }),
  ]);
  return {
    newCount,
    latest: latest.map((i) => ({ id: i.id, eventName: i.eventName, customerName: i.customer.name, createdAt: i.createdAt.toISOString() })),
  };
}

export const failedEmailCount = () => db.emailJob.count({ where: { status: "failed" } });

export async function dashboardData(search: string) {
  const [customers, newInquiries, failedJobs, newCounts] = await Promise.all([
    db.customer.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
      // Oversikten trenger bare etikett og tidspunkt, ikke hele innholds-JSON-en til hver kunde.
      include: { currentVersion: { select: { id: true, number: true, label: true, publishedAt: true } } },
    }),
    db.inquiry.findMany({ where: { status: "new" }, orderBy: { createdAt: "desc" }, take: 5, include: { customer: true } }),
    failedEmailCount(),
    db.inquiry.groupBy({ by: ["customerId"], where: { status: "new" }, _count: true }),
  ]);
  return { customers, newInquiries, failedJobs, newCountByCustomer: new Map(newCounts.map((c) => [c.customerId, c._count])) };
}

export interface InquiryFilters { status?: string; customerId?: string; kind?: string; failedEmail?: boolean; q?: string }

/** Felles filter for listen og CSV-eksporten. Søket treffer arrangement, kontaktperson, e-post, referanse og kunde. */
function inquiryWhere(f: InquiryFilters): Prisma.InquiryWhereInput {
  const q = f.q?.trim();
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.failedEmail ? { emailJobs: { some: { status: "failed" } } } : {}),
    ...(q
      ? {
          OR: [
            { eventName: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { contactEmail: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export const INQUIRY_PAGE = 100;
export const INQUIRY_MAX = 2000;

export async function inquiryList(filters: InquiryFilters, take = INQUIRY_PAGE) {
  const where = inquiryWhere(filters);
  const [customers, list, total] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.inquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { customer: true, emailJobs: { select: { status: true } } },
      take: Math.min(Math.max(take, 1), INQUIRY_MAX),
    }),
    db.inquiry.count({ where }),
  ]);
  return { customers, list, total };
}

/** Alle forespørsler som matcher filteret (til CSV), nyeste først. */
export const inquiriesForExport = (filters: InquiryFilters) =>
  db.inquiry.findMany({ where: inquiryWhere(filters), orderBy: { createdAt: "desc" }, include: { customer: true }, take: 10_000 });

export const inquiryDetail = (id: string) =>
  db.inquiry.findUnique({ where: { id }, include: { customer: true, version: true, emailJobs: { orderBy: { createdAt: "asc" } } } });

export const recentEmailJobs = (take = 100) =>
  db.emailJob.findMany({ orderBy: { createdAt: "desc" }, take, include: { inquiry: { include: { customer: true } } } });

export const customerForEditor = (id: string) =>
  db.customer.findUnique({
    where: { id },
    include: { draft: true, currentVersion: true, assets: { orderBy: { createdAt: "desc" } } },
  });

export const customerWithDraft = (id: string) => db.customer.findUnique({ where: { id }, include: { draft: true } });

export const customerVersions = (id: string) =>
  db.customer.findUnique({ where: { id }, include: { versions: { orderBy: { number: "desc" } } } });

export const versionByNumber = (customerId: string, number: number) =>
  db.publishedVersion.findUnique({ where: { customerId_number: { customerId, number } } });
