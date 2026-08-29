import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n-config";

export const revalidate = 3600;

type Params = { params: Promise<{ locale: string; slug: string }> };

// TMDB's genre+keyword hub pages (dozens of themed sub-category rows per hub - "zombie",
// "isekai", "Studio Ghibli", ...) have no honest equivalent against the StreamFlix provider
// catalog, which has no queryable discover API - see the note in streamflix.ts. This whole
// route is intentionally retired rather than faked.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata(_: Params): Promise<Metadata> {
  return { title: "Not found" };
}

export default async function CategoryPage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  notFound();
}
