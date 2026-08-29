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

// ─── stable numeric id for object identity only (React keys, equality checks) ─────────────────
// NOT used for routing - see slug.ts's encodeProviderId/buildProviderSlug for that. A hash can't
// be reversed, so it can never survive a real page navigation (home page and detail page are two
// separate requests); routing carries provider+id directly in the URL instead. This hash only
// needs to be a stable indeed-a-number for whatever `.id` a TMDB-shaped object is expected to have.
function stableNumericId(...parts: string[]): number {
  const key = parts.join("::");
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  }
  return h & 0x7fffffff;
}

// ─── backend DTOs (mirrors Backend.kt's Show/Category/Provider DTOs) ───────────────────────────
interface BackendGenre {
  id: string;
  name: string;
}
interface BackendPerson {
  id: string;
  name: string;
  image: string | null;
}
interface BackendSeason {
  id: string;
  number: number;
  title: string | null;
}
interface BackendShow {
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

// ─── mapping backend shows into the TMDB-shaped types the rest of the app uses ─────────────────
function toMediaItem(dto: BackendShow, provider: string): MediaItem {
  const id = stableNumericId(provider, dto.id);
  const shared = {
    id,
    overview: dto.overview ?? "",
    poster_path: dto.poster,
    backdrop_path: dto.banner,
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
    // `id` here is deliberately the season NUMBER, not a hash of the backend's own season id -
    // getSeasonEpisodes() below needs to ask the backend for "season N of show X", and a season
    // number is something the client already has in hand (right here) with no lookup required,
    // unlike an opaque id that would hit the same cross-request problem the slug rework fixed
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

// ─── home page: dynamic rows straight from whatever the selected provider curates ──────────────
// no TMDB-style fixed trending/popular/horror/anime rows - the provider's own home feed already
// comes pre-organized into named sections (however many, whatever they're called), which is what
// actually gets rendered
export interface HomeRow {
  name: string;
  items: MediaItem[];
}

export async function getHomeRows(provider: string): Promise<HomeRow[]> {
  const categories = await api<BackendCategory[]>(`/api/home?provider=${encodeURIComponent(provider)}`, 900);
  const rows = categories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      name: c.name || "In evidenza",
      items: c.items.map((item) => toMediaItem(item, provider)),
    }));

  // il primo blocco alimenta l'hero banner (vedi HomeView) - le pagine elenco dei provider non
  // portano mai la trama (solo titolo/poster), quella esiste solo sulla pagina di dettaglio, quindi
  // per i pochi item che finiscono davvero nell'hero la recuperiamo con una fetch di dettaglio in più
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

// ─── detail pages - provider+id come straight from the URL (see slug.ts), no registry needed ───
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

// ─── catalog-wide pagination (sitemap) ──────────────────────────────────────
export async function discoverMoviesPage(page: number, provider: string): Promise<{ results: Movie[] }> {
  const dtos = await api<BackendShow[]>(`/api/movies?provider=${encodeURIComponent(provider)}&page=${page}`, 3600);
  return { results: dtos.map((d) => toMediaItem(d, provider) as Movie) };
}

export async function discoverTVPage(page: number, provider: string): Promise<{ results: TVShow[] }> {
  const dtos = await api<BackendShow[]>(`/api/tvshows?provider=${encodeURIComponent(provider)}&page=${page}`, 3600);
  return { results: dtos.map((d) => toMediaItem(d, provider) as TVShow) };
}

// ─── hub/category pages (TMDB genre+keyword taxonomy) ───────────────────────────────────────────
// dropped: the provider catalog has no equivalent of TMDB's discover API (arbitrary
// genre+keyword+sort queries across its whole database), so the elaborate themed sub-category
// pages this used to power (dozens of rows per hub: "zombie", "isekai", "Studio Ghibli", ...)
// have no honest way to be rebuilt. Callers treat a null/empty return as "not found".
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
