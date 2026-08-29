import { useState, useEffect } from "react";
import { getSelectedProviderClient, PROVIDER_CHANGED_EVENT } from "@/lib/provider";

// keyed by (provider, realId, mediaType) rather than a numeric TMDB-style id - the numeric id is
// only a hash (see streamflix.ts's stableNumericId) and can't be reversed back into a URL, so it
// can't tell two shows from different providers apart, and it can't route "continue watching" back
// to the right page. provider+realId is exactly what the URL slug is built from (see slug.ts), so
// resuming a title always lands on the correct provider regardless of which one is selected now.
export interface WatchedItem {
  provider: string;
  realId: string;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  addedAt: number; // timestamp
  lastWatchedAt: number; // timestamp
  currentTime?: number; // secondi (progresso attuale)
  duration?: number;    // secondi (durata totale)
  progress?: number;    // 0-100 (calcolato da currentTime/duration)
  season?: number;      // per serie TV
  episode?: number;     // per serie TV
}

const STORAGE_KEY = "streamflix_continue_watching";
const MAX_ITEMS = 20; // Mantieni solo gli ultimi 20

function sameItem(a: { provider: string; realId: string; mediaType: string }, b: { provider: string; realId: string; mediaType: string }) {
  return a.provider === b.provider && a.realId === b.realId && a.mediaType === b.mediaType;
}

export function useContinueWatching() {
  // items tiene TUTTI gli item (di ogni provider) - il filtro sul provider attivo avviene solo in
  // lettura più sotto, così cambiare provider e tornare indietro non perde nulla: gli item degli
  // altri provider restano salvati, solo nascosti finché non è di nuovo quello attivo
  //
  // letto in modo SINCRONO dal localStorage nell'initializer di useState (non in un useEffect):
  // HlsPlayer legge startTime una sola volta, al mount, per il seek di "riprendi da dove eri" -
  // se items partisse vuoto e si popolasse solo dopo un effect (quindi al render successivo),
  // quel primo mount vedrebbe sempre startTime undefined e non riprenderebbe mai, anche con il
  // progresso corretto già salvato (HlsPlayer non re-inesegue quel seek quando la prop cambia
  // dopo, di proposito - altrimenti ogni salvataggio periodico ricaricherebbe lo stream da capo)
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

  // Carica da localStorage
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
    // items/activeProvider sono già inizializzati in modo sincrono sopra - qui restano solo gli
    // ascoltatori per aggiornamenti successivi (altre tab, altri componenti, cambio provider)

    // Ascolta per cambiamenti nel localStorage (anche dallo stesso tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        loadFromStorage();
      }
    };

    // Custom event per aggiornamenti nello stesso tab
    const handleCustomUpdate = () => {
      loadFromStorage();
    };

    // Riletto ad ogni cambio provider così la lista filtrata sotto si aggiorna subito
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

  // Salva in localStorage quando cambia
  const saveToStorage = (newItems: WatchedItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    setItems(newItems);

    // Trigger custom event per aggiornare altri componenti nello stesso tab
    window.dispatchEvent(new Event("continueWatchingUpdated"));
  };

  // Aggiorna currentTime/duration/season/episode di un item esistente
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
      // una duration non valida/0 dal player (frequente finché l'HLS non ha bufferato abbastanza
      // da conoscere la durata totale) non deve cancellare una durata già nota - altrimenti anche
      // "progress" (usato per la barra di avanzamento in home) diventerebbe inutilizzabile
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

  // Aggiungi o aggiorna item
  const addItem = (item: Omit<WatchedItem, "addedAt" | "lastWatchedAt">) => {
    const now = Date.now();

    setItems((prev) => {
      // Rimuovi se già esiste
      const filtered = prev.filter((i) => !sameItem(i, item));

      // Aggiungi in cima
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

  // Rimuovi item
  const removeItem = (provider: string, realId: string, mediaType: "movie" | "tv") => {
    setItems((prev) => {
      const newItems = prev.filter((i) => !sameItem(i, { provider, realId, mediaType }));
      saveToStorage(newItems);
      return newItems;
    });
  };

  // Pulisci tutto
  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  };

  return {
    // tutti gli item, di ogni provider - per un lookup puntuale (progresso di QUESTA pagina,
    // qualunque sia il provider attivo in questo momento)
    items,
    // solo quelli del provider attivo - per liste/righe (es. "Continua a guardare" in home),
    // che devono davvero azzerarsi cambiando provider e ripopolarsi tornando su quello precedente
    activeProviderItems: items.filter((i) => i.provider === activeProvider),
    addItem,
    removeItem,
    updateProgress,
    clearAll,
  };
}
