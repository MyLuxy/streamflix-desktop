import "server-only";
import { BACKEND_URL } from "@/lib/backend";
import type {
  Movie,
  TVShow,
  MediaItem,
  MovieDetails,
  TVShowDetails,
  CastMember,
} from "@/lib/types";
import { tagProvider, providerTagOf } from "@/lib/provider-tag";
import {
  stableNumericId,
  toMediaItem,
  type BackendShow,
  type BackendPerson,
} from "@/lib/streamflix-mapping";

// mirrors Backend.kt's Show/Category/Provider DTOs
interface BackendCategory {
  name: string;
  items: BackendShow[];
}
export interface BackendProvider {
  name: string;
  language: string;
  movies: boolean;
  tvShows: boolean;
  logo: string;
  iptv: boolean;
}
export interface BackendEpisode {
  id: string;
  number: number;
  title: string | null;
  overview: string | null;
  poster: string | null;
}

async function api<T>(path: string, revalidate = 300): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`StreamFlix backend error: ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export const getProviders = () => api<BackendProvider[]>("/api/providers", 3600);

function toCastMembers(cast: BackendPerson[]): CastMember[] {
  return cast.map((p, i) => ({
    id: stableNumericId("cast", p.id),
    name: p.name,
    character: "",
    profile_path: p.image,
    order: i,
  }));
}

function toMovieDetails(dto: BackendShow, provider: string): MovieDetails {
  const base = toMediaItem(dto, provider) as Movie;
  return {
    ...base,
    budget: 0,
    genres: dto.genres.map((g) => ({ id: stableNumericId("genre", g.id), name: g.name })),
    homepage: "",
    imdb_id: "",
    production_companies: [],
    production_countries: [],
    revenue: 0,
    runtime: dto.runtime ?? 0,
    status: "",
    tagline: "",
    credits: { cast: toCastMembers(dto.cast), crew: [] },
  };
}

function toTVShowDetails(dto: BackendShow, provider: string): TVShowDetails {
  const base = toMediaItem(dto, provider) as TVShow;
  return {
    ...base,
    created_by: [],
    episode_run_time: dto.runtime ? [dto.runtime] : [],
    genres: dto.genres.map((g) => ({ id: stableNumericId("genre", g.id), name: g.name })),
    homepage: "",
    in_production: false,
    languages: [],
    last_air_date: "",
    last_episode_to_air: null,
    next_episode_to_air: null,
    networks: [],
    number_of_episodes: 0,
    number_of_seasons: dto.seasons.length,
    // id is the season NUMBER on purpose, getSeasonEpisodes needs that not an opaque backend id
    seasons: dto.seasons.map((s) => ({
      id: s.number,
      name: s.title || `Stagione ${s.number}`,
      overview: "",
      poster_path: null,
      air_date: "",
      season_number: s.number,
      episode_count: 0,
    })),
    status: "",
    tagline: "",
    type: "",
    credits: { cast: toCastMembers(dto.cast), crew: [] },
  };
}

// no fixed trending/popular/horror rows like TMDB, the provider's own home feed is already
// organized into named sections and we just render those
export interface HomeRow {
  name: string;
  items: MediaItem[];
}

export async function getHomeRows(provider: string): Promise<HomeRow[]> {
  const categories = await api<BackendCategory[]>(`/api/home?provider=${encodeURIComponent(provider)}`, 900);
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  // prefer the first category that actually has a real banner, not just the first category,
  // poster-only stuff (AnimeUnity's "Ultimi Episodi") looked stretched and grainy in the hero
  const heroIndex = nonEmpty.findIndex((c) => c.items.some((it) => it.banner));
  const ordered =
    heroIndex > 0
      ? [nonEmpty[heroIndex], ...nonEmpty.slice(0, heroIndex), ...nonEmpty.slice(heroIndex + 1)]
      : nonEmpty;

  const rows = ordered.map((c) => ({
    name: c.name || "In evidenza",
    items: c.items.map((item) => toMediaItem(item, provider)),
  }));

  // list pages never carry an overview, only the detail page does, so fetch it for the hero items
  const heroRow = rows[0];
  if (heroRow) {
    const heroItems = heroRow.items.slice(0, 5);
    const enriched = await Promise.all(
      heroItems.map(async (item) => {
        if (item.overview) return item;
        const tag = providerTagOf(item);
        if (!tag) return item;
        const isMovie = "title" in item;
        const overview = await (isMovie ? getMovieDetails(tag.provider, tag.realId) : getTVDetails(tag.provider, tag.realId))
          .then((d) => d.overview)
          .catch(() => "");
        return overview ? { ...item, overview } : item;
      })
    );
    heroRow.items = [...enriched, ...heroRow.items.slice(5)];
  }

  return rows;
}

export async function search(provider: string, query: string): Promise<MediaItem[]> {
  if (!query.trim()) return [];
  const dtos = await api<BackendShow[]>(
    `/api/search?provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(query)}`,
    60,
  );
  return dtos.map((d) => toMediaItem(d, provider));
}

// provider+id come straight from the url (slug.ts), no registry lookup needed
export async function getMovieDetails(provider: string, id: string): Promise<MovieDetails> {
  const dto = await api<BackendShow>(
    `/api/movie?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}`,
    86400,
  );
  return toMovieDetails(dto, provider);
}

export async function getTVDetails(provider: string, id: string): Promise<TVShowDetails> {
  const dto = await api<BackendShow>(
    `/api/tvshow?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}`,
    86400,
  );
  return toTVShowDetails(dto, provider);
}

export async function getMovieRecommendations(provider: string, id: string): Promise<{ results: Movie[] }> {
  const dto = await api<BackendShow>(
    `/api/movie?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}`,
    86400,
  );
  return { results: dto.recommendations.map((r) => toMediaItem(r, provider) as Movie) };
}

export async function getTVRecommendations(provider: string, id: string): Promise<{ results: TVShow[] }> {
  const dto = await api<BackendShow>(
    `/api/tvshow?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}`,
    86400,
  );
  return { results: dto.recommendations.map((r) => toMediaItem(r, provider) as TVShow) };
}

export async function getSeasonEpisodes(provider: string, tvId: string, seasonNumber: number): Promise<BackendEpisode[]> {
  return api<BackendEpisode[]>(
    `/api/episodes?provider=${encodeURIComponent(provider)}&tvId=${encodeURIComponent(tvId)}&seasonNumber=${seasonNumber}`,
    300,
  );
}

export async function discoverMoviesPage(page: number, provider: string): Promise<{ results: Movie[] }> {
  const dtos = await api<BackendShow[]>(`/api/movies?provider=${encodeURIComponent(provider)}&page=${page}`, 3600);
  return { results: dtos.map((d) => toMediaItem(d, provider) as Movie) };
}

export async function discoverTVPage(page: number, provider: string): Promise<{ results: TVShow[] }> {
  const dtos = await api<BackendShow[]>(`/api/tvshows?provider=${encodeURIComponent(provider)}&page=${page}`, 3600);
  return { results: dtos.map((d) => toMediaItem(d, provider) as TVShow) };
}

// dropped, providers have nothing like TMDB's discover api to power these themed hub pages
export function isHubSlug(_slug: string): boolean {
  return false;
}
export async function getCategoryHub(_slug: string): Promise<null> {
  return null;
}
export async function getCategoryItems(_slug: string): Promise<null> {
  return null;
}
export async function getAnimeRows(): Promise<never[]> {
  return [];
}
