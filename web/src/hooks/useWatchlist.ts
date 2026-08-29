import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { WatchlistItem } from "@/lib/types";
import { getSelectedProviderClient, PROVIDER_CHANGED_EVENT } from "@/lib/provider";

const STORAGE_KEY = "streamify-watchlist";

// ─────────────────────────────────────────────────────────────
// Store condiviso (singleton a livello di modulo).
// Tutti i componenti che usano useWatchlist leggono/scrivono lo stesso
// stato: niente più istanze indipendenti che si sovrascrivono tra loro
// (era la causa del "reset" al reload). Sincronizzato anche tra tab.
//
// Lo store tiene TUTTI gli item (di ogni provider, più gli hentai) in un
// unico elenco - il filtro per provider attivo avviene solo in lettura
// (vedi useWatchlist), così cambiare provider e tornare indietro non perde
// nulla: gli item degli altri provider restano salvati, solo nascosti.
// ─────────────────────────────────────────────────────────────

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
    /* ignora JSON corrotto */
  }

  // pulizia una tantum: film/serie salvati prima che esistessero provider/realId (o ancora da
  // prima, con l'id numerico del vecchio schema VetoX) non sono più risolvibili in un URL valido
  // - provider+realId non è ricostruibile da un id hash, per lo stesso motivo per cui l'intero
  // schema di slug è stato riscritto. Restano solo quelli con provider+realId, più gli hentai
  // (che per loro natura non hanno mai avuto questi campi, non sono legati a nessun provider)
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

// il numero id è già derivato da (provider, id-reale) - vedi stableNumericId in streamflix.ts -
// quindi confrontare su (id, mediaType) distingue già correttamente lo stesso titolo su provider
// diversi, senza bisogno di portare provider/realId dentro il matching
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

  // riletto ad ogni cambio provider (evento sparato da setSelectedProviderClient) così la lista
  // filtrata sotto si aggiorna subito, anche senza un reload di pagina
  const [activeProvider, setActiveProvider] = useState<string>(() => getSelectedProviderClient());
  useEffect(() => {
    setActiveProvider(getSelectedProviderClient());
    const onProviderChanged = () => setActiveProvider(getSelectedProviderClient());
    window.addEventListener(PROVIDER_CHANGED_EVENT, onProviderChanged);
    return () => window.removeEventListener(PROVIDER_CHANGED_EVENT, onProviderChanged);
  }, []);

  // gli hentai (senza campo provider) restano sempre visibili - non sono legati a nessuno dei
  // provider StreamFlix, solo film/serie vengono filtrati sul provider attivo
  const watchlist = allItems.filter((i) => !i.provider || i.provider === activeProvider);

  const addToWatchlist = useCallback((item: Omit<WatchlistItem, "addedAt">) => add(item), []);
  const removeFromWatchlist = useCallback(
    (id: number, mediaType: WatchlistItem["mediaType"]) => remove(id, mediaType),
    []
  );
  const isInWatchlist = useCallback(
    (id: number, mediaType: WatchlistItem["mediaType"]) => has(id, mediaType),
    // dipende da allItems così i componenti si riaggiornano al cambio
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
