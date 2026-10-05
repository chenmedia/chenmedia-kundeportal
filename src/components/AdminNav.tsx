"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface Item { id: string; eventName: string; customerName: string; createdAt: string }
interface Snapshot { newCount: number; latest: Item[]; failedEmails?: number }

const POLL_MS = 15_000;
const BASE_TITLE = "Administrasjon | Chen Media";

/**
 * Meny med teller og midlertidig varsling i nettsiden for nye forespørsler.
 * Erstatter e-postvarsel til en e-postleverandør er på plass.
 */
export function AdminNav({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [toasts, setToasts] = useState<Item[]>([]);
  const known = useRef(new Set(initial.latest.map((i) => i.id)));

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as Snapshot;
      const fresh = d.latest.filter((i) => !known.current.has(i.id));
      fresh.forEach((i) => known.current.add(i.id));
      if (fresh.length) setToasts((t) => [...fresh, ...t].slice(0, 3));
      setSnap({ newCount: d.newCount, latest: d.latest, failedEmails: d.failedEmails ?? 0 });
    } catch {
      /* nettverksfeil: prøver igjen ved neste runde */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void poll(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [poll]);

  useEffect(() => {
    document.title = snap.newCount > 0 ? `(${snap.newCount}) ${BASE_TITLE}` : BASE_TITLE;
  }, [snap.newCount]);

  return (
    <>
      <nav aria-label="Hovedmeny" className="flex flex-wrap gap-x-6 gap-y-1 text-[15px] font-semibold">
        <Link className="link" href="/admin">Kunder</Link>
        <Link className="link" href="/admin/foresporsler">
          Forespørsler
          {snap.newCount > 0 && (
            <span className="badge badge-fill ml-2" data-testid="new-count">
              {snap.newCount}<span className="sr-only"> nye</span>
            </span>
          )}
        </Link>
        <Link className="link" href="/admin/utboks">
          E-postutboks
          {(snap.failedEmails ?? 0) > 0 && (
            <span className="badge ml-2 !border-err !text-err" data-testid="failed-emails">
              {snap.failedEmails}<span className="sr-only"> feilede e-poster</span>
            </span>
          )}
        </Link>
      </nav>

      <div aria-live="polite" className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[360px] z-[60] grid gap-3">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="card !border-2 !border-ink p-4 shadow-lg" data-testid="inquiry-toast">
            <p className="eyebrow !text-ink"><span className="status-dot" aria-hidden="true" />Ny forespørsel</p>
            <p className="title mt-1">{t.eventName}</p>
            <p className="text-sm text-muted">{t.customerName}</p>
            <div className="mt-3 flex gap-2">
              <Link className="btn btn-dark btn-sm" href={`/admin/foresporsler/${t.id}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>Åpne</Link>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>Lukk</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
