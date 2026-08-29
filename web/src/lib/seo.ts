import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import {
  locales,
  defaultLocale,
  localeToHreflang,
  type Locale,
} from "@/lib/i18n-config";
import type { MovieDetails, TVShowDetails } from "@/lib/types";

// Costruisce la mappa hreflang per i metadati Next: { en: url, it: url, ..., 'x-default': url }
export function hreflangAlternates(
  buildPath: (locale: Locale) => string
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[localeToHreflang[l]] = `${SITE_URL}${buildPath(l)}`;
  }
  languages["x-default"] = `${SITE_URL}${buildPath(defaultLocale)}`;
  return languages;
}

function posterAbs(path: string | null): string | undefined {
  return imageUrl(path, IMAGE_SIZES.poster.large) ?? undefined;
}

// Durata ISO 8601 (es. 142 min -> "PT142M")
function isoDuration(min?: number | null): string | undefined {
  return min && min > 0 ? `PT${min}M` : undefined;
}

export function movieJsonLd(data: MovieDetails, canonicalPath: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: data.title,
    url: `${SITE_URL}${canonicalPath}`,
    description: data.overview || undefined,
    image: posterAbs(data.poster_path),
    datePublished: data.release_date || undefined,
    genre: data.genres?.map((g) => g.name),
    duration: isoDuration(data.runtime),
    aggregateRating:
      data.vote_count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: data.vote_average.toFixed(1),
            ratingCount: data.vote_count,
            bestRating: 10,
            worstRating: 0,
          }
        : undefined,
    actor: data.credits?.cast?.slice(0, 8).map((c) => ({
      "@type": "Person",
      name: c.name,
    })),
  };
}

export function tvJsonLd(data: TVShowDetails, canonicalPath: string) {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: data.name,
    url: `${SITE_URL}${canonicalPath}`,
    description: data.overview || undefined,
    image: posterAbs(data.poster_path),
    datePublished: data.first_air_date || undefined,
    genre: data.genres?.map((g) => g.name),
    numberOfSeasons: data.number_of_seasons,
    numberOfEpisodes: data.number_of_episodes,
    aggregateRating:
      data.vote_count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: data.vote_average.toFixed(1),
            ratingCount: data.vote_count,
            bestRating: 10,
            worstRating: 0,
          }
        : undefined,
    actor: data.credits?.cast?.slice(0, 8).map((c) => ({
      "@type": "Person",
      name: c.name,
    })),
  };
}

export function breadcrumbJsonLd(
  section: string,
  sectionPath: string,
  name: string,
  itemPath: string
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: section, item: `${SITE_URL}${sectionPath}` },
      { "@type": "ListItem", position: 3, name, item: `${SITE_URL}${itemPath}` },
    ],
  };
}
