import { useState, useEffect } from "react";
import { getSelectedProviderClient, PROVIDER_CHANGED_EVENT } from "@/lib/provider";

// keyed by provider+realId, not the numeric id (thats just a hash, cant round trip to a url)
export interface WatchedItem {
  provider: string;
  realId: string;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  addedAt: number;
  lastWatchedAt: number;
  currentTime?: number;
  duration?: number;
  progress?: number;
  season?: number;
  episode?: number;
}

const STORAGE_KEY = "streamflix_continue_watching";
const MAX_ITEMS = 20;

function sameItem(a: { provider: string; realId: string; mediaType: string }, b: { provider: string; realId: string; mediaType: string }) {
  return a.provider === b.provider && a.realId === b.realId && a.mediaType === b.mediaType;
}

export function useContinueWatching() {
  // reads localStorage synchronously here (not in an effect), HlsPlayer needs startTime on
  // first mount for the resume seek and only reads it once
  const [items, setItems] = useState<WatchedItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [activeProvider, setActiveProvider] = useState<string>(() => getSelectedProviderClient());

  const loadFromStorage = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setItems(parsed);
      } catch (error) {
        console.error("Error loading continue watching:", error);
        setItems([]);
      }
    }
  };

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        loadFromStorage();
      }
    };

    const handleCustomUpdate = () => {
      loadFromStorage();
    };

    const handleProviderChanged = () => {
      setActiveProvider(getSelectedProviderClient());
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("continueWatchingUpdated", handleCustomUpdate);
    window.addEventListener(PROVIDER_CHANGED_EVENT, handleProviderChanged);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("continueWatchingUpdated", handleCustomUpdate);
      window.removeEventListener(PROVIDER_CHANGED_EVENT, handleProviderChanged);
    };
  }, []);

  const saveToStorage = (newItems: WatchedItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    setItems(newItems);
    window.dispatchEvent(new Event("continueWatchingUpdated"));
  };

  const updateProgress = (
    provider: string,
    realId: string,
    mediaType: "movie" | "tv",
    updates: { currentTime?: number; duration?: number; season?: number; episode?: number }
  ) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => sameItem(i, { provider, realId, mediaType }));
      if (idx === -1) return prev;
      const updated = [...prev];
      const ct = updates.currentTime ?? updated[idx].currentTime ?? 0;
      // dont let a 0/missing duration from the player wipe out one we already had
      const dur = (updates.duration && updates.duration > 0 ? updates.duration : updated[idx].duration) || 1;
      updated[idx] = {
        ...updated[idx],
        ...updates,
        duration: dur,
        progress: Math.round((ct / dur) * 100),
        lastWatchedAt: Date.now(),
      };
      saveToStorage(updated);
      return updated;
    });
  };

  const addItem = (item: Omit<WatchedItem, "addedAt" | "lastWatchedAt">) => {
    const now = Date.now();

    setItems((prev) => {
      const filtered = prev.filter((i) => !sameItem(i, item));
      const newItem: WatchedItem = {
        ...item,
        addedAt: now,
        lastWatchedAt: now,
      };

      const newItems = [newItem, ...filtered].slice(0, MAX_ITEMS);
      saveToStorage(newItems);
      return newItems;
    });
  };

  const removeItem = (provider: string, realId: string, mediaType: "movie" | "tv") => {
    setItems((prev) => {
      const newItems = prev.filter((i) => !sameItem(i, { provider, realId, mediaType }));
      saveToStorage(newItems);
      return newItems;
    });
  };

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  };

  return {
    items,
    // scoped to the active provider, for the home row
    activeProviderItems: items.filter((i) => i.provider === activeProvider),
    addItem,
    removeItem,
    updateProgress,
    clearAll,
  };
}
