import { STATUS_LABELS } from "@/lib/content";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${status === "new" ? "badge-fill" : ""}`}>
      {status === "new" && <span className="status-dot !mr-1.5 !h-2 !w-2" aria-hidden="true" />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const EMAIL_STATUS: Record<string, string> = {
  pending: "Venter",
  sent: "Sendt",
  failed: "Feilet",
  local_preview: "Lokal forhåndsvisning – ikke sendt",
};
