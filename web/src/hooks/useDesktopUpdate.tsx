"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface UpdateEventPayload {
  type: "available" | "not-available" | "progress" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

interface StreamflixDesktopBridge {
  checkForUpdates: () => Promise<void>;
  getUpdateState: () => Promise<UpdateEventPayload | null>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => Promise<void>;
  getVersion: () => Promise<string>;
  onUpdateEvent: (callback: (payload: UpdateEventPayload) => void) => () => void;
  showInFolder: (filePath: string) => Promise<void>;
  openDebugTerminal: (locale: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  setPresence: (payload: Record<string, unknown>) => Promise<void>;
  clearPresence: () => Promise<void>;
  saveDebugLog: (content: string) => Promise<{ success: boolean; filePath?: string }>;
}

declare global {
  interface Window {
    // only present inside the Electron shell, absent in the plain browser/dev server
    streamflixDesktop?: StreamflixDesktopBridge;
  }
}

interface UpdateState {
  status: "idle" | "available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

interface UpdateContextValue {
  isDesktop: boolean;
  state: UpdateState;
  download: () => void;
  restart: () => void;
}

// state lives above every consumer, a component mounting after the main process's one-time event would otherwise miss it
const UpdateContext = createContext<UpdateContextValue | null>(null);

// TEMPORARY: lets ?debugUpdate=available|downloading|downloaded be tried in a plain browser, remove later
function debugStateFromUrl(): UpdateState | null {
  if (typeof window === "undefined") return null;
  const requested = new URLSearchParams(window.location.search).get("debugUpdate");
  if (requested === "available") return { status: "available", version: "1.1.0" };
  if (requested === "downloading") return { status: "downloading", version: "1.1.0", percent: 42 };
  if (requested === "downloaded") return { status: "downloaded", version: "1.1.0" };
  if (requested === "error") return { status: "error", version: "1.1.0" };
  return null;
}

// notify-only, never triggers a download/install without the user explicitly calling download()/restart()
export function UpdateProvider({ children }: { children: ReactNode }) {
  // starts false so ssr/first client render match, flips true in the effect below if present
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDebug, setIsDebug] = useState(false); // TEMPORARY
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  useEffect(() => {
    const debugState = debugStateFromUrl(); // TEMPORARY
    if (debugState) {
      setIsDesktop(true);
      setIsDebug(true);
      setState(debugState);
      return;
    }

    const bridge = window.streamflixDesktop;
    if (!bridge) return;
    setIsDesktop(true);

    const apply = (payload: UpdateEventPayload) => {
      if (payload.type === "available") {
        setState({ status: "available", version: payload.version });
      } else if (payload.type === "progress") {
        setState((prev) => ({ status: "downloading", version: payload.version ?? prev.version, percent: payload.percent }));
      } else if (payload.type === "downloaded") {
        setState({ status: "downloaded", version: payload.version });
      } else if (payload.type === "error") {
        // a failed check (offline, feed unreachable) isnt worth surfacing, the next check just tries again.
        // only a download that breaks midway is shown, that one the user actually started
        setState((prev) =>
          prev.status === "downloading" ? { status: "error", version: prev.version, message: payload.message } : prev,
        );
      }
      // "not-available" is deliberately ignored, nothing new to show
    };

    const unsubscribe = bridge.onUpdateEvent(apply);

    // the page reloads on language change and the main process only sends each event once, so pick up where it left off.
    // rejects in dev where auto update isnt registered, nothing to restore there
    bridge.getUpdateState().then((saved) => { if (saved) apply(saved); }).catch(() => {});

    // the main process only re-checks every few hours, so a check that failed offline would otherwise wait that long
    const recheckWhenBackOnline = () => {
      if (statusRef.current === "idle") bridge.checkForUpdates().catch(() => {});
    };
    window.addEventListener("online", recheckWhenBackOnline);

    return () => {
      unsubscribe();
      window.removeEventListener("online", recheckWhenBackOnline);
    };
  }, []);

  const download = useCallback(() => {
    setState((prev) => ({ status: "downloading", version: prev.version, percent: 0 }));
    if (isDebug) {
      // temporary: fake a download finishing in ~2s so the "downloaded" state is reachable too
      let percent = 0;
      const iv = setInterval(() => {
        percent += 20;
        if (percent >= 100) {
          clearInterval(iv);
          setState((prev) => ({ status: "downloaded", version: prev.version }));
        } else {
          setState((prev) => ({ status: "downloading", version: prev.version, percent }));
        }
      }, 400);
      return;
    }
    window.streamflixDesktop?.downloadUpdate();
  }, [isDebug]);

  const restart = useCallback(() => {
    if (isDebug) {
      alert("(debug) qui l'app si riavvierebbe e installerebbe l'aggiornamento"); // TEMPORARY
      return;
    }
    window.streamflixDesktop?.quitAndInstall();
  }, [isDebug]);

  return (
    <UpdateContext.Provider value={{ isDesktop, state, download, restart }}>
      {children}
    </UpdateContext.Provider>
  );
}

export function useDesktopUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useDesktopUpdate must be used within UpdateProvider");
  return ctx;
}
