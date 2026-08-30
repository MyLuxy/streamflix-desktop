// client-safe mirror of streamflix.ts's toMediaItem, that one is server-only
import { tagProvider } from "@/lib/provider-tag";
import type { Movie, TVShow, MediaItem } from "@/lib/types";
import type { StreamflixSearchItem } from "@/hooks/useStreamflix";

function stableNumericId(...parts: string[]): number {
  const key = parts.join("::");
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  }
  return h & 0x7fffffff;
}

export function toMediaItemClient(dto: StreamflixSearchItem, provider: string): MediaItem {
  const id = stableNumericId(provider, dto.id);
  const shared = {
    id,
    overview: dto.overview ?? "",
    poster_path: dto.poster,
    backdrop_path: dto.banner,
    vote_average: dto.rating ?? 0,
    vote_count: 0,
    popularity: 0,
    genre_ids: [] as number[],
    original_language: "",
  };
  if (dto.type === "movie") {
    const movie: Movie = {
      ...shared,
      title: dto.title,
      original_title: dto.title,
      release_date: dto.released ?? "",
      adult: false,
      video: false,
      media_type: "movie",
    };
    return tagProvider(movie, provider, dto.id) as MediaItem;
  }
  const tv: TVShow = {
    ...shared,
    name: dto.title,
    original_name: dto.title,
    first_air_date: dto.released ?? "",
    origin_country: [],
    media_type: "tv",
  };
  return tagProvider(tv, provider, dto.id) as MediaItem;
}
