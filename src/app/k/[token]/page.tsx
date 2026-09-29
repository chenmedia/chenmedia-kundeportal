import { notFound } from "next/navigation";
import { CustomerPage } from "@/components/CustomerPage";
import { resolvePublished } from "@/server/customers";
import { emailConfigured } from "@/server/email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fotopakker og priser | Chen Media", robots: { index: false, follow: false, nocache: true } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pub = await resolvePublished(token);
  if (!pub) notFound();
  return (
    <CustomerPage
      customerName={pub.customerName}
      content={pub.content}
      versionId={pub.version.id}
      versionNumber={pub.version.number}
      publishedAt={pub.version.publishedAt}
      token={token}
      mediaUrl={(id) => `/k/${token}/media/${id}`}
      emailConfigured={emailConfigured()}
    />
  );
}
