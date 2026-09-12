"use client";

import { useEffect, useState } from "react";

// window.streamflixDesktop is declared in useDesktopUpdate.ts, already loaded since settings pulls in both
export function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // TEMPORARY: matches useDesktopUpdate's own debugUpdate override for plain-browser testing
    if (new URLSearchParams(window.location.search).has("debugUpdate")) {
      setVersion("1.0.4");
      return;
    }
    window.streamflixDesktop?.getVersion().then(setVersion).catch(() => {});
  }, []);

  return version;
}
