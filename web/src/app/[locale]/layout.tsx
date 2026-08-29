import { notFound } from "next/navigation";
import { Providers } from "../providers";
import { locales, isLocale } from "@/lib/i18n-config";

// Pre-genera le 4 lingue
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <Providers locale={locale}>{children}</Providers>;
}
