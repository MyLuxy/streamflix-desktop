import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n-config";

export const revalidate = 3600;

type Params = { params: Promise<{ locale: string; slug: string }> };

// no discover api to back these hub pages, route stays dead on purpose
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
