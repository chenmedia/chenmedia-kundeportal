import Link from "next/link";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { formatDateTime } from "@/lib/content";
import { emailConfigured } from "@/server/email";
import { EMAIL_STATUS } from "@/components/AdminBits";

export default async function Outbox() {
  await requireAdmin();
  const jobs = await db.emailJob.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { inquiry: { include: { customer: true } } } });
  return (
    <div className="grid gap-6">
      <h1 className="display text-3xl">E-postutboks</h1>
      <p className="card p-5" role="note">
        {emailConfigured()
          ? "E-postleverandør er konfigurert. Sendte e-poster vises her med status."
          : "Ingen e-postleverandør er konfigurert. E-postene under er lokal forhåndsvisning og er ikke sendt til noen."}
      </p>
      {jobs.length === 0 ? <p className="card p-6 text-muted">Ingen e-poster ennå.</p> : (
        <ul className="grid gap-4">
          {jobs.map((j) => (
            <li key={j.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`badge ${j.status === "local_preview" ? "badge-fill" : ""}`}>{EMAIL_STATUS[j.status] ?? j.status}</span>
                <span className="text-sm text-muted">{formatDateTime(j.createdAt)} · til {j.recipient}{j.replyTo ? ` · svar til ${j.replyTo}` : ""}</span>
                <Link className="link text-sm ml-auto" href={`/admin/foresporsler/${j.inquiryId}`}>{j.inquiry.customer.name}: {j.inquiry.reference}</Link>
              </div>
              <h2 className="title mt-3">{j.subject}</h2>
              <pre className="mt-2 whitespace-pre-wrap text-sm font-body bg-cream/60 rounded-xl p-4 overflow-x-auto">{j.body}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
