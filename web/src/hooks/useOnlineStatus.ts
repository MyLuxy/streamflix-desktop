"use client";

import { useEffect, useState } from "react";

// starts true (matches SSR, where there's no navigator) and only flips based on the
// browser's own online/offline events - navigator.onLine reflects the OS-reported network
// interface state, so this catches "no connection at all", not a single site being down
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
