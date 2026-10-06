"use client";

import { useEffect, useState } from "react";

// window.streamflixDesktop is declared in useDesktopUpdate.ts, already loaded since settings pulls in both
export function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    window.streamflixDesktop?.getVersion().then(setVersion).catch(() => {});
  }, []);

  return version;
}
