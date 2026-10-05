/**
 * Lesemodeller for administrasjonen. Sider og API-ruter henter data herfra i stedet for å
 * kalle databasen direkte, slik at spørringer ligger på ett sted og kan gjenbrukes.
 */
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

export async function inquiryList(filters: { status?: string; customerId?: string; failedEmail?: boolean }) {
  const [customers, list] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.inquiry.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.failedEmail ? { emailJobs: { some: { status: "failed" } } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { customer: true, emailJobs: { select: { status: true } } },
      take: 200,
    }),
  ]);
  return { customers, list };
}

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
