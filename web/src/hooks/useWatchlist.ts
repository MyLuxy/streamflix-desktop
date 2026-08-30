import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { WatchlistItem } from "@/lib/types";
import { getSelectedProviderClient, PROVIDER_CHANGED_EVENT } from "@/lib/provider";

const STORAGE_KEY = "streamify-watchlist";

// module level singleton so every useWatchlist() call shares one state, synced across tabs too
let items: WatchlistItem[] = [];
let initialized = false;
const listeners = new Set<() => void>();
const EMPTY: WatchlistItem[] = [];

function loadOnce() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) items = JSON.parse(stored);
  } catch {
    // corrupted json, whatever
  }

  // drops old entries saved before provider/realId existed, cant resolve those to a url anymore
  const cleaned = items.filter((i) => i.mediaType === "hentai" || (i.provider && i.realId));
  if (cleaned.length !== items.length) {
    items = cleaned;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
  emit();
}

function has(id: number, mediaType: WatchlistItem["mediaType"]) {
  return items.some((i) => i.id === id && i.mediaType === mediaType);
}

function add(item: Omit<WatchlistItem, "addedAt">) {
  if (has(item.id, item.mediaType)) return;
  items = [...items, { ...item, addedAt: Date.now() }];
  persist();
}

function remove(id: number, mediaType: WatchlistItem["mediaType"]) {
  items = items.filter((i) => !(i.id === id && i.mediaType === mediaType));
  persist();
}

function subscribe(cb: () => void) {
  loadOnce();
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      items = e.newValue ? JSON.parse(e.newValue) : [];
    } catch {
      items = [];
    }
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => items;
const getServerSnapshot = () => EMPTY;

export function useWatchlist() {
  const allItems = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [activeProvider, setActiveProvider] = useState<string>(() => getSelectedProviderClient());
  useEffect(() => {
    setActiveProvider(getSelectedProviderClient());
    const onProviderChanged = () => setActiveProvider(getSelectedProviderClient());
    window.addEventListener(PROVIDER_CHANGED_EVENT, onProviderChanged);
    return () => window.removeEventListener(PROVIDER_CHANGED_EVENT, onProviderChanged);
  }, []);

  // hentai items have no provider so they always stay visible, only movies/shows get filtered
  const watchlist = allItems.filter((i) => !i.provider || i.provider === activeProvider);

  const addToWatchlist = useCallback((item: Omit<WatchlistItem, "addedAt">) => add(item), []);
  const removeFromWatchlist = useCallback(
    (id: number, mediaType: WatchlistItem["mediaType"]) => remove(id, mediaType),
    []
  );
  const isInWatchlist = useCallback(
    (id: number, mediaType: WatchlistItem["mediaType"]) => has(id, mediaType),
    [allItems]
  );
  const toggleWatchlist = useCallback((item: Omit<WatchlistItem, "addedAt">) => {
    if (has(item.id, item.mediaType)) remove(item.id, item.mediaType);
    else add(item);
  }, []);

  return {
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    toggleWatchlist,
  };
}
