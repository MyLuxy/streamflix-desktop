"use client";

import { useState, useEffect } from "react";

// traccia il progresso di OGNI episodio guardato, non solo l'ultimo - useContinueWatching tiene
// una sola voce per show (l'ultima posizione, per il resume e la riga "Continua a guardare" in
// home), quindi passando a un episodio diverso quella voce si sposta in avanti e la cronologia
// dell'episodio precedente andrebbe persa. Questo store separato non viene mai sovrascritto dal
// cambio episodio - serve solo a mostrare lo stato "visto"/percentuale nel picker episodi.
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
// tante voci quante ne servono per una cronologia reale (più show, più episodi ciascuno) senza
// crescere all'infinito - le più vecchie vengono scartate quando si supera il limite
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
      // una duration non valida/0 dal player non deve cancellare una durata già nota per questo
      // episodio, altrimenti "progress" diventerebbe inutilizzabile - stesso motivo di
      // useContinueWatching.updateProgress
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
        /* storage piena o non disponibile - il progresso resta solo in memoria per questa sessione */
      }
      return trimmed;
    });
  };

  const getEpisodeProgress = (provider: string, realId: string, season: number, episode: number) =>
    items.find((i) => sameEpisode(i, { provider, realId, season, episode }));

  return { updateEpisodeProgress, getEpisodeProgress };
}
