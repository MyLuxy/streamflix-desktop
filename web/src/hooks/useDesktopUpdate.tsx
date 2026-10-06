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
  setIdlePresence: (state: string | null) => Promise<void>;
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

// notify-only, never triggers a download/install without the user explicitly calling download()/restart()
export function UpdateProvider({ children }: { children: ReactNode }) {
  // starts false so ssr/first client render match, flips true in the effect below if present
  const [isDesktop, setIsDesktop] = useState(false);
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  useEffect(() => {
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
    window.streamflixDesktop?.downloadUpdate();
  }, []);

  const restart = useCallback(() => {
    window.streamflixDesktop?.quitAndInstall();
  }, []);

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
