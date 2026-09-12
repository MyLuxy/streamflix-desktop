import { useCallback, useSyncExternalStore } from "react";
import { BACKEND_URL } from "@/lib/backend";
import { DownloadItem } from "@/lib/types";

const STORAGE_KEY = "streamflix-downloads";

// same singleton pattern as useWatchlist.ts, synced across tabs via the storage event
let items: DownloadItem[] = [];
let initialized = false;
const listeners = new Set<() => void>();
const EMPTY: DownloadItem[] = [];
const activePolls = new Map<string, ReturnType<typeof setInterval>>();

function loadOnce() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) items = JSON.parse(stored);
  } catch {
    // corrupted json, whatever
  }
  resumePolling();
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

// a movie downloads as a whole, an episode needs season+episode to tell it apart from the rest of the show
function keyFor(provider: string, realId: string, mediaType: "movie" | "tv", season?: number, episode?: number) {
  return mediaType === "tv" ? `${provider}:${realId}:tv:s${season}e${episode}` : `${provider}:${realId}:movie`;
}

function find(key: string) {
  return items.find((i) => i.key === key);
}

function update(key: string, patch: Partial<DownloadItem>) {
  items = items.map((i) => (i.key === key ? { ...i, ...patch } : i));
  persist();
}

function remove(key: string) {
  const poll = activePolls.get(key);
  if (poll) {
    clearInterval(poll);
    activePolls.delete(key);
  }
  items = items.filter((i) => i.key !== key);
  persist();
}

function pollStatus(key: string, jobId: string) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/download/status?jobId=${jobId}`);
      if (!res.ok) {
        // backend has no memory of this job, either its long gone or a fresh process replaced it
        clearInterval(interval);
        activePolls.delete(key);
        update(key, { status: "failed", error: "lost track of this download" });
        return;
      }
      const data = await res.json();
      if (data.phase === "done") {
        clearInterval(interval);
        activePolls.delete(key);
        update(key, { status: "done", phase: data.phase, progress: 1, filePath: data.filePath });
      } else if (data.phase === "failed" || data.phase === "cancelled") {
        clearInterval(interval);
        activePolls.delete(key);
        remove(key);
      } else {
        update(key, { phase: data.phase, progress: data.progress, paused: data.paused });
      }
    } catch {
      // a single missed poll isn't fatal, the next tick just tries again
    }
  }, 1500);
  activePolls.set(key, interval);
}

// a "downloading" item from storage could be a live job (page reload) or a dead one (app restarted), ask the backend instead of guessing
function resumePolling() {
  for (const item of items) {
    if (item.status !== "downloading" || !item.jobId || activePolls.has(item.key)) continue;
    const key = item.key;
    const jobId = item.jobId;
    fetch(`${BACKEND_URL}/api/download/status?jobId=${jobId}`)
      .then((res) => {
        if (!res.ok) throw new Error("unknown job");
        return res.json();
      })
      .then((data) => {
        if (data.phase === "done") {
          update(key, { status: "done", phase: data.phase, progress: 1, filePath: data.filePath });
        } else if (data.phase === "failed" || data.phase === "cancelled") {
          remove(key);
        } else {
          update(key, { phase: data.phase, progress: data.progress, paused: data.paused });
          pollStatus(key, jobId);
        }
      })
      .catch(() => {
        update(key, { status: "failed", error: "lost track of this download" });
      });
  }
}

async function startDownload(request: Omit<DownloadItem, "key" | "addedAt" | "status">) {
  const key = keyFor(request.provider, request.realId, request.mediaType, request.season, request.episode);
  if (find(key)) return;

  items = [...items, { ...request, key, addedAt: Date.now(), status: "downloading", progress: 0 }];
  persist();

  try {
    const res = await fetch(`${BACKEND_URL}/api/download/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: request.provider,
        itemId: request.realId,
        type: request.mediaType,
        seasonNumber: request.season,
        episodeNumber: request.episode,
        title: request.mediaType === "tv"
          ? `${request.title} - S${request.season}E${request.episode}`
          : request.title,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      update(key, { status: "failed", error: data.error ?? "could not start download" });
      return;
    }
    update(key, { jobId: data.jobId });
    pollStatus(key, data.jobId);
  } catch {
    update(key, { status: "failed", error: "could not reach the backend" });
  }
}

async function retryDownload(key: string) {
  const item = find(key);
  if (!item) return;
  remove(key);
  await startDownload({
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    provider: item.provider,
    realId: item.realId,
    season: item.season,
    episode: item.episode,
    episodeTitle: item.episodeTitle,
  });
}

async function cancelDownload(key: string) {
  const item = find(key);
  if (item?.jobId) {
    fetch(`${BACKEND_URL}/api/download/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: item.jobId }),
    }).catch(() => {});
  }
  remove(key);
}

async function togglePause(key: string) {
  const item = find(key);
  if (!item?.jobId) return;
  const paused = !item.paused;
  update(key, { paused });
  try {
    await fetch(`${BACKEND_URL}/api/download/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: item.jobId, paused }),
    });
  } catch {
    // next poll will reconcile the real state if this call didnt land
  }
}

async function deleteDownloadedFile(key: string): Promise<boolean> {
  const item = find(key);
  if (!item?.filePath) {
    remove(key);
    return true;
  }
  // user already confirmed, remove it from the list even if the file itself couldnt be deleted
  try {
    const res = await fetch(`${BACKEND_URL}/api/download/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: item.filePath }),
    });
    await res.json();
  } catch {
    // no network, whatever, still honor the removal below
  }
  remove(key);
  return true;
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

  const getDownload = useCallback(
    (provider: string, realId: string, mediaType: "movie" | "tv", season?: number, episode?: number) =>
      find(keyFor(provider, realId, mediaType, season, episode)),
    [downloads]
  );

  const isDownloaded = useCallback(
    (provider: string, realId: string, mediaType: "movie" | "tv", season?: number, episode?: number) =>
      find(keyFor(provider, realId, mediaType, season, episode))?.status === "done",
    [downloads]
  );

  const start = useCallback((request: Omit<DownloadItem, "key" | "addedAt" | "status">) => {
    startDownload(request);
  }, []);

  const removeDownload = useCallback((key: string) => remove(key), []);
  const deleteFile = useCallback((key: string) => deleteDownloadedFile(key), []);
  const cancel = useCallback((key: string) => cancelDownload(key), []);
  const pause = useCallback((key: string) => togglePause(key), []);
  const retry = useCallback((key: string) => retryDownload(key), []);

  return {
    downloads,
    getDownload,
    isDownloaded,
    startDownload: start,
    removeDownload,
    deleteDownloadedFile: deleteFile,
    cancelDownload: cancel,
    togglePause: pause,
    retryDownload: retry,
  };
}
