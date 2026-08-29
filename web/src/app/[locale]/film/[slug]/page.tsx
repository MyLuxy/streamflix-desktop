import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getMovieDetails,
  getMovieRecommendations,
} from "@/lib/streamflix";
import { parseProviderIdFromSlug, buildProviderSlug } from "@/lib/slug";
import { DetailView } from "@/components/DetailView";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { movieJsonLd, breadcrumbJsonLd, hreflangAlternates } from "@/lib/seo";
import { isLocale, type Locale } from "@/lib/i18n-config";
import type { MovieDetails } from "@/lib/types";

export const revalidate = 86400; // 24h

type Params = { params: Promise<{ locale: string; slug: string }> };

// Suffisso SEO localizzato per i titoli
const titleSuffix: Record<Locale, string> = {
  en: "watch online",
  it: "streaming ITA",
  fr: "streaming VF",
  es: "ver online",
};

async function loadMovie(slug: string): Promise<{ data: MovieDetails; provider: string; realId: string } | null> {
  const parsed = parseProviderIdFromSlug(slug);
  if (!parsed) return null;
  try {
    const data = await getMovieDetails(parsed.provider, parsed.id);
    return { data, provider: parsed.provider, realId: parsed.id };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const loaded = await loadMovie(slug);
  if (!loaded) return { title: "Not found" };
  const { data, provider, realId } = loaded;

  const year = data.release_date ? new Date(data.release_date).getFullYear() : "";
  const title = `${data.title}${year ? ` (${year})` : ""} ${titleSuffix[locale]}`;
  const description =
    (data.overview && data.overview.slice(0, 160)) ||
    `${data.title} — ${SITE_NAME}.`;
  const ogImg = imageUrl(data.backdrop_path, IMAGE_SIZES.backdrop.large) ?? undefined;

  const canonical = buildProviderSlug(provider, realId, data.original_title || data.title);
  const path = (l: string) => `/${l}/film/${canonical}`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}${path(locale)}`,
      languages: hreflangAlternates((l) => path(l)),
    },
    openGraph: {
      type: "video.movie",
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

export default async function FilmPage({ params }: Params) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const loaded = await loadMovie(slug);
  if (!loaded) notFound();
  const { data, provider, realId } = loaded;

  // Redirect 308 allo slug canonico (un solo URL indicizzabile per lingua)
  const canonical = buildProviderSlug(provider, realId, data.original_title || data.title);
  if (slug !== canonical) permanentRedirect(`/${locale}/film/${canonical}`);

  const canonicalPath = `/${locale}/film/${canonical}`;
  const ld = movieJsonLd(data, canonicalPath);
  const crumbs = breadcrumbJsonLd("Film", `/${locale}`, data.title, canonicalPath);

  const recs = await getMovieRecommendations(provider, realId).catch(() => null);

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
        // forza il remount cambiando titolo: playing/startSeason/startEpisode sono useState
        // inizializzati dall'URL/dal progress solo al primo mount, e senza questa key React
        // riusa la stessa istanza tra due film diversi (stessa route /[locale]/film/[slug]),
        // lasciando lo stato (quindi anche il minutaggio di resume) di quello precedente
        key={`${provider}:${realId}`}
        data={data}
        mediaType="movie"
        provider={provider}
        realId={realId}
        recommendations={recs?.results?.slice(0, 18) ?? []}
      />
    </>
  );
}
