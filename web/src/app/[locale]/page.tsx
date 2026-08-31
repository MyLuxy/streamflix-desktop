import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeView } from "@/components/HomeView";
import { getHomeRows, getProviders } from "@/lib/streamflix";
import { getSelectedProvider } from "@/lib/provider";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { hreflangAlternates } from "@/lib/seo";

// force-dynamic cause home depends on the provider cookie, cant prerender that
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string }> };

const homeMeta: Record<Locale, { title: string; description: string }> = {
  en: {
    title: `${SITE_NAME} — Watch Movies & TV Shows in HD`,
    description:
      "Watch thousands of movies and TV shows in HD. Anime, films and series, no registration required.",
  },
  it: {
    title: `${SITE_NAME} — Film e Serie TV in streaming HD`,
    description:
      "Guarda migliaia di film e serie TV in streaming HD. Anime, film e serie, senza registrazione.",
  },
  fr: {
    title: `${SITE_NAME} — Films et Séries en streaming HD`,
    description:
      "Regardez des milliers de films et séries en HD. Animes, films et séries, sans inscription.",
  },
  es: {
    title: `${SITE_NAME} — Películas y Series en HD`,
    description:
      "Mira miles de películas y series en HD. Anime, películas y series, sin registro.",
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const meta = isLocale(locale) ? homeMeta[locale] : homeMeta.en;
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: hreflangAlternates((l) => `/${l}`),
    },
    openGraph: {
      type: "website",
      title: meta.title,
      description: meta.description,
      url: `${SITE_URL}/${locale}`,
    },
  };
}

export default async function HomePage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const provider = await getSelectedProvider();
  let rows: Awaited<ReturnType<typeof getHomeRows>> = [];
  let error: string | null = null;
  try {
    rows = await getHomeRows(provider);
  } catch (e) {
    console.error(`getHomeRows failed for provider "${provider}":`, e);
    error = e instanceof Error ? e.message : String(e);
  }

  // resolved server-side (not via the client useProviders hook) so live-tv providers
  // render their landscape channel cards on the first paint, no post-hydration flash
  let isIptv = false;
  try {
    const providers = await getProviders();
    isIptv = providers.find((p) => p.name === provider)?.iptv ?? false;
  } catch {
    // providers fetch failing is orthogonal to home rendering, just fall back to portrait cards
  }

  return <HomeView rows={rows} error={error} provider={provider} isIptv={isIptv} />;
}
