import { useCallback, useSyncExternalStore } from "react";
import { DownloadItem } from "@/lib/types";

const STORAGE_KEY = "streamflix-downloads";

// same module-level singleton pattern as useWatchlist.ts - shared across every call site,
// synced across tabs via the storage event
let items: DownloadItem[] = [];
let initialized = false;
const listeners = new Set<() => void>();
const EMPTY: DownloadItem[] = [];

function loadOnce() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) items = JSON.parse(stored);
  } catch {
    // corrupted json, whatever
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

// a movie downloads as a whole, an episode needs season+episode to tell it apart from
// the rest of the show
function keyFor(provider: string, realId: string, mediaType: "movie" | "tv", season?: number, episode?: number) {
  return mediaType === "tv" ? `${provider}:${realId}:tv:s${season}e${episode}` : `${provider}:${realId}:movie`;
}

function has(key: string) {
  return items.some((i) => i.key === key);
}

function add(item: Omit<DownloadItem, "key" | "addedAt">) {
  const key = keyFor(item.provider, item.realId, item.mediaType, item.season, item.episode);
  if (has(key)) return;
  items = [...items, { ...item, key, addedAt: Date.now() }];
  persist();
}

function remove(key: string) {
  items = items.filter((i) => i.key !== key);
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

export function useDownloads() {
  const downloads = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isDownloaded = useCallback(
    (provider: string, realId: string, mediaType: "movie" | "tv", season?: number, episode?: number) =>
      has(keyFor(provider, realId, mediaType, season, episode)),
    [downloads]
  );

  const toggleDownload = useCallback((item: Omit<DownloadItem, "key" | "addedAt">) => {
    const key = keyFor(item.provider, item.realId, item.mediaType, item.season, item.episode);
    if (has(key)) remove(key);
    else add(item);
  }, []);

  const removeDownload = useCallback((key: string) => remove(key), []);

  return { downloads, isDownloaded, toggleDownload, removeDownload };
}
