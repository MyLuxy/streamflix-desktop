import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getTVDetails,
  getTVRecommendations,
} from "@/lib/streamflix";
import { parseProviderIdFromSlug, buildProviderSlug } from "@/lib/slug";
import { DetailView } from "@/components/DetailView";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { tvJsonLd, breadcrumbJsonLd, hreflangAlternates } from "@/lib/seo";
import { isLocale, type Locale } from "@/lib/i18n-config";
import type { TVShowDetails } from "@/lib/types";

export const revalidate = 86400; // 24h

type Params = { params: Promise<{ locale: string; slug: string }> };

const titleSuffix: Record<Locale, string> = {
  en: "watch online",
  it: "streaming ITA",
  fr: "streaming VF",
  es: "ver online",
};

async function loadTV(slug: string): Promise<{ data: TVShowDetails; provider: string; realId: string } | null> {
  const parsed = parseProviderIdFromSlug(slug);
  if (!parsed) return null;
  try {
    const data = await getTVDetails(parsed.provider, parsed.id);
    return { data, provider: parsed.provider, realId: parsed.id };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const loaded = await loadTV(slug);
  if (!loaded) return { title: "Not found" };
  const { data, provider, realId } = loaded;

  const year = data.first_air_date ? new Date(data.first_air_date).getFullYear() : "";
  const title = `${data.name}${year ? ` (${year})` : ""} ${titleSuffix[locale]}`;
  const description =
    (data.overview && data.overview.slice(0, 160)) ||
    `${data.name} — ${SITE_NAME}.`;
  const ogImg = imageUrl(data.backdrop_path, IMAGE_SIZES.backdrop.large) ?? undefined;

  const canonical = buildProviderSlug(provider, realId, data.original_name || data.name);
  const path = (l: string) => `/${l}/serie/${canonical}`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}${path(locale)}`,
      languages: hreflangAlternates((l) => path(l)),
    },
    openGraph: {
      type: "video.tv_show",
      title,
      description,
      url: `${SITE_URL}${path(locale)}`,
      images: ogImg ? [{ url: ogImg }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImg ? [ogImg] : [],
    },
  };
}

export default async function SeriePage({ params }: Params) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const loaded = await loadTV(slug);
  if (!loaded) notFound();
  const { data, provider, realId } = loaded;

  const canonical = buildProviderSlug(provider, realId, data.original_name || data.name);
  if (slug !== canonical) permanentRedirect(`/${locale}/serie/${canonical}`);

  const canonicalPath = `/${locale}/serie/${canonical}`;
  const ld = tvJsonLd(data, canonicalPath);
  const crumbs = breadcrumbJsonLd("Serie TV", `/${locale}`, data.name, canonicalPath);

  const recs = await getTVRecommendations(provider, realId).catch(() => null);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
      />
      <DetailView
        // vedi commento gemello in film/[slug]/page.tsx: senza key React riusa la stessa
        // istanza di DetailView passando da una serie all'altra, lasciando playing/
        // startSeason/startEpisode (quindi il minutaggio di resume) del titolo precedente
        key={`${provider}:${realId}`}
        data={data}
        mediaType="tv"
        provider={provider}
        realId={realId}
        recommendations={recs?.results?.slice(0, 18) ?? []}
      />
    </>
  );
}
