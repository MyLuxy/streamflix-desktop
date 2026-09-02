// non-httpOnly cookie so both the server-side tmdb routes and this client helper read the
// same value. client-safe (no next/headers), unlike lib/tmdb.ts
export const TMDB_KEY_COOKIE = "tmdb_api_key";

export function getCustomTmdbKeyClient(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TMDB_KEY_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCustomTmdbKeyClient(key: string | null) {
  if (typeof document === "undefined") return;
  if (key) {
    document.cookie = `${TMDB_KEY_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=${60 * 60 * 24 * 365}`;
  } else {
    document.cookie = `${TMDB_KEY_COOKIE}=; path=/; max-age=0`;
  }
}
