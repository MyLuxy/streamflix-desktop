import { cookies } from "next/headers";
import { TMDB_KEY_COOKIE } from "@/lib/tmdb-key";

const TMDB_BEARER = process.env.TMDB_BEARER_TOKEN || "";
const BUILT_IN_TMDB_API_KEY = process.env.TMDB_API_KEY || "2dca580c2a14b55200e784d157207b4d";
const FALLBACK_TMDB_API_KEY = process.env.TMDB_API_KEY_FALLBACK || "2dca580c2a14b55200e784d157207b4d";

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// a key the user entered themselves always wins and always goes through api_key, the bearer
// token (if configured) is only ever used for the built-in default
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

// pathWithQuery already has its own "?...", e.g. "/person/123?language=en-US". retries once
// with the fallback key if the primary one (custom or built-in) comes back rate limited or
// revoked, same behavior as the desktop backend's own tmdb client
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
