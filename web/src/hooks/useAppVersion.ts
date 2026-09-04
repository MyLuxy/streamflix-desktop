"use client";

import { useEffect, useState } from "react";

// window.streamflixDesktop is declared in useDesktopUpdate.ts, already loaded wherever
// this hook is used since the settings page pulls in both
export function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // TEMPORARY - matches useDesktopUpdate's own debugUpdate override, so the version
    // section is visible in the same plain-browser test as the rest of the update ui
    if (new URLSearchParams(window.location.search).has("debugUpdate")) {
      setVersion("1.0.2");
      return;
    }
    window.streamflixDesktop?.getVersion().then(setVersion).catch(() => {});
  }, []);

  return version;
}
