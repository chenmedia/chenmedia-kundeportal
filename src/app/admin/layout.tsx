import Link from "next/link";
import { currentAdmin } from "@/server/admin-auth";
import { Logo } from "@/components/Logo";
import { AdminNav } from "@/components/AdminNav";
import { failedEmailCount, newInquirySnapshot } from "@/server/queries";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administrasjon | Chen Media", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  const initial = admin ? { ...(await newInquirySnapshot()), failedEmails: await failedEmailCount() } : { newCount: 0, latest: [], failedEmails: 0 };
  return (
    <div className="min-h-screen bg-[#f7f6ec]">
      <a href="#innhold" className="skip-link">Hopp til innhold</a>
      <header className="bg-cream border-b border-line">
        <div className="wrap flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
          <Link href="/admin" aria-label="Chen Media administrasjon, til oversikten"><Logo height={34} /></Link>
          {admin && (
            <>
              <AdminNav initial={initial} />
              <form action={logoutAction} className="ml-auto">
                <span className="text-sm text-muted mr-3 hidden sm:inline">{admin.email}</span>
                <button className="btn btn-outline btn-sm" type="submit">Logg ut</button>
              </form>
            </>
          )}
        </div>
      </header>
      <main id="innhold" className="wrap py-8 md:py-10">{children}</main>
    </div>
  );
}
