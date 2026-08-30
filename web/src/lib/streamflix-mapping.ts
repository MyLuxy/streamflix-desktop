// shared backend -> tmdb-shape mapping, split out of streamflix.ts since that ones server-only
import type { Movie, TVShow, MediaItem } from "@/lib/types";
import { tagProvider } from "@/lib/provider-tag";

// just for react key/equality, not for routing, see slug.ts for the real url id
export function stableNumericId(...parts: string[]): number {
  const key = parts.join("::");
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  }
  return h & 0x7fffffff;
}

export interface BackendGenre {
  id: string;
  name: string;
}
export interface BackendPerson {
  id: string;
  name: string;
  image: string | null;
}
export interface BackendSeason {
  id: string;
  number: number;
  title: string | null;
}
export interface BackendShow {
  id: string;
  title: string;
  type: "movie" | "tv";
  poster: string | null;
  banner: string | null;
  logo: string | null;
  overview: string | null;
  rating: number | null;
  released: string | null;
  runtime: number | null;
  genres: BackendGenre[];
  cast: BackendPerson[];
  seasons: BackendSeason[];
  recommendations: BackendShow[];
}

export function toMediaItem(dto: BackendShow, provider: string): MediaItem {
  const id = stableNumericId(provider, dto.id);
  const shared = {
    id,
    overview: dto.overview ?? "",
    poster_path: dto.poster ?? dto.banner,
    backdrop_path: dto.banner ?? dto.poster,
    logo_path: dto.logo,
    vote_average: dto.rating ?? 0,
    vote_count: 0,
    popularity: 0,
    genre_ids: dto.genres.map((g) => stableNumericId("genre", g.id)),
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
