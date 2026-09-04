"use client";

import { useCallback, useEffect, useState } from "react";

interface UpdateEventPayload {
  type: "available" | "not-available" | "progress" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

interface StreamflixDesktopBridge {
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => Promise<void>;
  onUpdateEvent: (callback: (payload: UpdateEventPayload) => void) => () => void;
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

// notify-only: the main process checks on its own and tells us when something's available,
// we never trigger a download/install without the user explicitly asking via download()/restart()
export function useDesktopUpdate() {
  // starts false so ssr/first client render match, flips true in the effect below if present
  const [isDesktop, setIsDesktop] = useState(false);
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    const bridge = window.streamflixDesktop;
    if (!bridge) return;
    setIsDesktop(true);

    return bridge.onUpdateEvent((payload) => {
      if (payload.type === "available") {
        setState({ status: "available", version: payload.version });
      } else if (payload.type === "progress") {
        setState((prev) => ({ status: "downloading", version: prev.version, percent: payload.percent }));
      } else if (payload.type === "downloaded") {
        setState({ status: "downloaded", version: payload.version });
      } else if (payload.type === "error") {
        setState({ status: "error", message: payload.message });
      }
      // "not-available" is deliberately ignored, nothing new to show
    });
  }, []);

  const download = useCallback(() => {
    setState((prev) => ({ status: "downloading", version: prev.version, percent: 0 }));
    window.streamflixDesktop?.downloadUpdate();
  }, []);

  const restart = useCallback(() => {
    window.streamflixDesktop?.quitAndInstall();
  }, []);

  return { isDesktop, state, download, restart };
}
