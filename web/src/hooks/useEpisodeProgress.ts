"use client";

import { useState, useEffect } from "react";

// separate from useContinueWatching, that one only keeps the latest episode per show
export interface EpisodeProgress {
  provider: string;
  realId: string;
  season: number;
  episode: number;
  currentTime: number;
  duration: number;
  progress: number; // 0-100
  lastWatchedAt: number;
}

const STORAGE_KEY = "streamflix_episode_progress";
const MAX_ITEMS = 500;

function sameEpisode(
  a: { provider: string; realId: string; season: number; episode: number },
  b: { provider: string; realId: string; season: number; episode: number }
) {
  return a.provider === b.provider && a.realId === b.realId && a.season === b.season && a.episode === b.episode;
}

export function useEpisodeProgress() {
  const [items, setItems] = useState<EpisodeProgress[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        setItems(e.newValue ? JSON.parse(e.newValue) : []);
      } catch {
        setItems([]);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateEpisodeProgress = (
    provider: string,
    realId: string,
    season: number,
    episode: number,
    updates: { currentTime: number; duration: number }
  ) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => sameEpisode(i, { provider, realId, season, episode }));
      // same dur=0 guard as useContinueWatching
      const dur =
        (updates.duration && updates.duration > 0 ? updates.duration : idx !== -1 ? prev[idx].duration : 0) || 1;
      const newItem: EpisodeProgress = {
        provider,
        realId,
        season,
        episode,
        currentTime: updates.currentTime,
        duration: dur,
        progress: Math.round((updates.currentTime / dur) * 100),
        lastWatchedAt: Date.now(),
      };
      const next = idx !== -1 ? [...prev.slice(0, idx), newItem, ...prev.slice(idx + 1)] : [...prev, newItem];
      const trimmed = next.length > MAX_ITEMS ? next.slice(next.length - MAX_ITEMS) : next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // storage full or blocked, progress just wont persist this session
      }
      return trimmed;
    });
  };

  const getEpisodeProgress = (provider: string, realId: string, season: number, episode: number) =>
    items.find((i) => sameEpisode(i, { provider, realId, season, episode }));

  return { updateEpisodeProgress, getEpisodeProgress };
}
