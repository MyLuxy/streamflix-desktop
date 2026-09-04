"use client";

import { useEffect } from "react";

const APP_TITLE = "StreamFlix";

// desktop windows dont need seo titles, so pin the title bar/taskbar
// to just "StreamFlix" no matter what next sets per page
export function DesktopTitleLock() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.streamflixDesktop) return;

    document.title = APP_TITLE;
    const titleEl = document.querySelector("title");
    if (!titleEl) return;

    const observer = new MutationObserver(() => {
      if (document.title !== APP_TITLE) document.title = APP_TITLE;
    });
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
