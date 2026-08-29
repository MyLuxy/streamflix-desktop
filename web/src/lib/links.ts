import { buildSlug, buildProviderSlug } from "./slug";
import { providerTagOf } from "./provider-tag";
import type { Locale } from "./i18n-config";
import type { Movie, TVShow, MediaItem } from "./types";

export type MediaType = "movie" | "tv";

// Segmento di percorso per tipo (localizzato a livello di URL: film/serie restano
// uguali in tutte le lingue per semplicità di routing).
export function typeSegment(mediaType: MediaType): string {
  return mediaType === "movie" ? "film" : "serie";
}

// URL SEO della scheda contenuto, con prefisso lingua:
// /{locale}/film/{id}-{titolo} oppure /{locale}/serie/{id}-{titolo}
export function contentHref(
  locale: Locale,
  id: number,
  mediaType: MediaType,
  title: string
): string {
  return `/${locale}/${typeSegment(mediaType)}/${buildSlug(id, title)}`;
}

// Deduce mediaType + titolo da un item TMDB generico
export function resolveItem(item: Movie | TVShow | MediaItem): {
  id: number;
  mediaType: MediaType;
  title: string;
} {
  const mediaType: MediaType =
    "media_type" in item && item.media_type
      ? (item.media_type as MediaType)
      : "title" in item
      ? "movie"
      : "tv";
  // Slug indipendente dalla lingua: usa il titolo originale (stesso URL in tutte
  // le lingue, cambia solo il prefisso /it /en ...). Fallback al titolo localizzato.
  const title =
    "title" in item
      ? item.original_title || item.title
      : item.original_name || item.name;
  return { id: item.id, mediaType, title };
}

export function hrefForItem(
  locale: Locale,
  item: Movie | TVShow | MediaItem
): string {
  const { id, mediaType, title } = resolveItem(item);
  const tag = providerTagOf(item);
  // every item that came from the StreamFlix backend (see streamflix.ts) carries a provider tag -
  // that's the normal case, and it's what makes the resulting URL resolvable by a later, separate
  // request (see slug.ts). The plain numeric-id fallback only exists for anything that somehow
  // isn't tagged (shouldn't happen once everything flows through toMediaItem).
  const slug = tag ? buildProviderSlug(tag.provider, tag.realId, title) : buildSlug(id, title);
  return `/${locale}/${typeSegment(mediaType)}/${slug}`;
}

// Prefissa un percorso interno con la lingua corrente: ("/cerca","it") -> "/it/cerca"
export function localePath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}
