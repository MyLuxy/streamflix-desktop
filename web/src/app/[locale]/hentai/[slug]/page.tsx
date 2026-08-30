import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n-config";
import { SITE_NAME } from "@/lib/site";
import { HentaiPageClient } from "@/components/HentaiPageClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${SITE_NAME} — ${slug.replace(/-/g, " ")}`,
    robots: { index: false, follow: false },
  };
}

export default async function HentaiDetailPage({ params }: Params) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  return <HentaiPageClient slug={slug} />;
}
