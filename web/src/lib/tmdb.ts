import { cookies } from "next/headers";
import { TMDB_KEY_COOKIE } from "@/lib/tmdb-key";

const TMDB_BEARER = process.env.TMDB_BEARER_TOKEN || "";
const BUILT_IN_TMDB_API_KEY = process.env.TMDB_API_KEY || "2dca580c2a14b55200e784d157207b4d";
const FALLBACK_TMDB_API_KEY = process.env.TMDB_API_KEY_FALLBACK || "2dca580c2a14b55200e784d157207b4d";

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// a user-entered key always wins and goes through api_key, the bearer token is only for the built-in default
async function resolveTmdbAuth() {
  const store = await cookies();
  const customKey = store.get(TMDB_KEY_COOKIE)?.value?.trim() || null;

  if (!customKey && TMDB_BEARER) {
    return { headers: { Authorization: `Bearer ${TMDB_BEARER}` }, apiKeyParam: null as string | null, fallbackKeyParam: null as string | null };
  }
  const primary = customKey || BUILT_IN_TMDB_API_KEY;
  return {
    headers: {},
    apiKeyParam: primary,
    fallbackKeyParam: FALLBACK_TMDB_API_KEY !== primary ? FALLBACK_TMDB_API_KEY : null,
  };
}

// retries once with the fallback key if the primary comes back rate limited or revoked
export async function tmdbFetch(pathWithQuery: string): Promise<Response> {
  const { headers, apiKeyParam, fallbackKeyParam } = await resolveTmdbAuth();
  const fullHeaders = { accept: "application/json", ...headers };
  const url = (key: string | null) =>
    `${TMDB_BASE_URL}${pathWithQuery}${key ? `&api_key=${key}` : ""}`;

  const res = await fetch(url(apiKeyParam), { headers: fullHeaders, next: { revalidate: 86400 } });
  if (fallbackKeyParam && [401, 403, 429].includes(res.status)) {
    return fetch(url(fallbackKeyParam), { headers: fullHeaders, next: { revalidate: 86400 } });
  }
  return res;
}

// strips trailing year/alt-title/season/language noise some providers tack onto every title, tmdb only indexes the base name
const TITLE_NOISE =
  /\s*\([^)]*\)\s*$|\s*[-–:]?\s*(season|saison|stagione|temporada|staffel|part|parte|partie|teil|cour)\s*\d+(?:\s+\S+)?\s*$|\s*[-–:]?\s*\d+(?:st|nd|rd|th)\s+(season|cour|part|series)\s*$|\s*[-–:]?\s*(final|last)\s+(season|cour|part|series)\s*$/i;

// strips one layer of noise at a time, some providers double it up like "Reacher - Saison 4 - Saison 4 French"
export function cleanTitle(rawTitle: string): string {
  let title = rawTitle;
  let prev;
  do {
    prev = title;
    title = title.replace(TITLE_NOISE, "").trim();
  } while (title !== prev);
  return title;
}

// best-match poster/backdrop, used as a broken-image fallback and to swap art on the homepage hero
export async function searchTmdbArtwork(rawTitle: string, year: string | null, type: "movie" | "tv") {
  const title = cleanTitle(rawTitle);
  let query = `/search/${type}?query=${encodeURIComponent(title)}&language=en-US`;
  if (year) {
    query += `&${type === "movie" ? "year" : "first_air_date_year"}=${encodeURIComponent(year)}`;
  }

  const res = await tmdbFetch(query);
  if (!res.ok) return { poster: null as string | null, backdrop: null as string | null };
  const data = await res.json();
  const match = data.results?.[0];
  return { poster: match?.poster_path ?? null, backdrop: match?.backdrop_path ?? null };
}
