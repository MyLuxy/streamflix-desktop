import { buildSlug, buildProviderSlug } from "./slug";
import { providerTagOf } from "./provider-tag";
import type { Locale } from "./i18n-config";
import type { Movie, TVShow, MediaItem } from "./types";

export type MediaType = "movie" | "tv";

export function typeSegment(mediaType: MediaType): string {
  return mediaType === "movie" ? "film" : "serie";
}

export function contentHref(
  locale: Locale,
  id: number,
  mediaType: MediaType,
  title: string
): string {
  return `/${locale}/${typeSegment(mediaType)}/${buildSlug(id, title)}`;
}

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
  // original title so the slug stays the same across locales
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
  // numeric id fallback shouldnt really happen once everything goes through toMediaItem
  const slug = tag ? buildProviderSlug(tag.provider, tag.realId, title) : buildSlug(id, title);
  return `/${locale}/${typeSegment(mediaType)}/${slug}`;
}

export function localePath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}
