import { notFound } from "next/navigation";
import { CustomerPage } from "@/components/CustomerPage";
import { resolvePublished } from "@/server/customers";
import { emailConfigured } from "@/server/email";
import { inquiryRetentionMonths } from "@/server/retention";

export const dynamic = "force-dynamic";
// Forhåndsvisning når lenken deles (Teams, Slack, e-post): bevisst nøytral, uten kundenavn eller priser.
export const metadata = {
  title: "Fotopakker og priser | Chen Media",
  description: "Pakker og priser fra Chen Media.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Fotopakker og priser | Chen Media",
    description: "Pakker og priser fra Chen Media.",
    type: "website" as const,
    locale: "nb_NO",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Chen Media" }],
  },
  twitter: { card: "summary_large_image" as const, images: ["/brand/og.png"] },
};

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
      retentionMonths={inquiryRetentionMonths()}
    />
  );
}
