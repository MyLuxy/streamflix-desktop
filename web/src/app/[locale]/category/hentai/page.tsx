import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n-config";
import { SITE_NAME } from "@/lib/site";
import { HentaiHubView } from "@/components/HentaiHubView";

// real data loads client side via /api/hentai
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `${SITE_NAME} — Hentai`,
    robots: { index: false, follow: false },
  };
}

export default async function HentaiPage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <HentaiHubView />;
}
