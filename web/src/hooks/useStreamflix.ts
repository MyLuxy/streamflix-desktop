"use client";

import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL } from "@/lib/backend";
import type { BackendShow } from "@/lib/streamflix-mapping";

export interface StreamflixEpisode {
  id: string;
  number: number;
  title: string | null;
  overview: string | null;
  poster: string | null;
}

// replaces the old useSeasonDetails(tvId, seasonNumber) TMDB hook - same shape of call (tv show +
// season number), but against our own backend and keyed by the season NUMBER rather than an
// opaque season id (see slug.ts/streamflix.ts for why that matters for cross-request lookups)
export function useSeasonEpisodes(provider: string, tvId: string, seasonNumber: number | null) {
  return useQuery({
    queryKey: ["streamflix", "episodes", provider, tvId, seasonNumber],
    queryFn: async (): Promise<StreamflixEpisode[]> => {
      const res = await fetch(
        `${BACKEND_URL}/api/episodes?provider=${encodeURIComponent(provider)}&tvId=${encodeURIComponent(tvId)}&seasonNumber=${seasonNumber}`,
      );
      if (!res.ok) throw new Error(`episodes fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: seasonNumber !== null && seasonNumber >= 0,
    staleTime: 1000 * 60 * 5,
  });
}

// each custom genre row (custom-home-sections.ts) gets its own query, loads/fails independently
export function useGenreItems(provider: string, genreId: string, enabled = true) {
  return useQuery({
    queryKey: ["streamflix", "genre", provider, genreId],
    queryFn: async (): Promise<BackendShow[]> => {
      const res = await fetch(
        `${BACKEND_URL}/api/genre?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(genreId)}&page=1`,
      );
      if (!res.ok) throw new Error(`genre fetch failed: ${res.status}`);
      const data = await res.json();
      return data.items ?? [];
    },
    enabled,
    staleTime: 1000 * 60 * 15,
  });
}

export interface StreamflixProvider {
  name: string;
  language: string;
  movies: boolean;
  tvShows: boolean;
  logo: string;
  iptv: boolean;
}

// stub replacing the old TMDB genre-list hook: the provider catalog has no global, queryable
// genre taxonomy (genres only come attached to individual items already loaded), so this always
// resolves empty rather than hitting a network endpoint that doesn't exist. Callers that already
// guard with `?? []` (the search page's genre dropdown) degrade to "no genre filter" cleanly.
export function useGenres(_type: "movie" | "tv") {
  return { data: undefined as { genres: { id: number; name: string }[] } | undefined, isLoading: false };
}

export function useProviders() {
  return useQuery({
    queryKey: ["streamflix", "providers"],
    queryFn: async (): Promise<StreamflixProvider[]> => {
      const res = await fetch(`${BACKEND_URL}/api/providers`);
      if (!res.ok) throw new Error(`providers fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
  });
}

export interface StreamflixSearchItem {
  id: string;
  title: string;
  type: "movie" | "tv";
  poster: string | null;
  banner: string | null;
  overview: string | null;
  rating: number | null;
  released: string | null;
}

// plain (non-hook) version, for call sites that already manage their own query lifecycle
// (react-query's useInfiniteQuery, in SearchPage.tsx) instead of using this as a hook directly
export async function searchStreamflix(provider: string, query: string): Promise<StreamflixSearchItem[]> {
  const res = await fetch(`${BACKEND_URL}/api/search?provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}

// live search against the currently selected provider's own catalog
export function useStreamflixSearch(provider: string, query: string, enabled = true) {
  return useQuery({
    queryKey: ["streamflix", "search", provider, query],
    queryFn: async (): Promise<StreamflixSearchItem[]> => {
      const res = await fetch(`${BACKEND_URL}/api/search?provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      return res.json();
    },
    enabled: enabled && query.trim().length >= 2,
    staleTime: 1000 * 60 * 2,
  });
}

export interface StreamServer {
  id: string;
  name: string;
}

export interface StreamResult {
  success: boolean;
  manifestUrl?: string;
  // "direct" is a plain file (mp4 etc) the browser can just play natively, no hls.js needed
  type?: "hls" | "direct";
  subtitles: { label: string; url: string; default: boolean }[];
  servers?: StreamServer[];
  error?: string;
}

// resolves a playable stream for a movie or a specific episode, returning a manifest URL that's
// already a full StreamFlix backend path (proxy-rewritten, header-spoofed) ready to hand to hls.js
export async function resolveStream(
  provider: string,
  itemId: string,
  type: "movie" | "tv",
  seasonNumber?: number,
  episodeId?: string,
  episodeNumber?: number,
  serverId?: string,
): Promise<StreamResult> {
  const res = await fetch(`${BACKEND_URL}/api/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, itemId, type, seasonNumber, episodeId, episodeNumber, serverId }),
  });
  if (!res.ok) return { success: false, subtitles: [], error: `HTTP ${res.status}` };
  return res.json();
}
