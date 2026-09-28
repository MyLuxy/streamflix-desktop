"use client";

import { useEffect, useState } from "react";

// decode() also waits for the load, and resolves either way so a broken url never holds anything up
function preload(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => undefined,
    () => undefined,
  );
}

// true once every url loaded or failed, or after capMs, so one slow logo cant keep the page hidden.
// stays true afterwards even if the list changes, later urls just load the normal way
export function useImagePreload(urls: string[], enabled: boolean, capMs = 3000): boolean {
  const [ready, setReady] = useState(false);
  const key = urls.join("|");

  useEffect(() => {
    if (!enabled || ready) return;
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setReady(true);
    };
    const timer = setTimeout(finish, capMs);
    Promise.all(urls.map(preload)).then(() => {
      clearTimeout(timer);
      finish();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, ready, capMs]);

  return ready;
}
