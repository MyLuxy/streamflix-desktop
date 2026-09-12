"use client";

import { useEffect } from "react";

const APP_TITLE = "StreamFlix";

// desktop windows dont need seo titles, pin the title bar/taskbar to just "StreamFlix"
export function DesktopTitleLock() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.streamflixDesktop) return;

    document.title = APP_TITLE;

    // watch <head> not <title> directly, next.js replaces the whole title element on route changes
    const observer = new MutationObserver(() => {
      if (document.title !== APP_TITLE) document.title = APP_TITLE;
    });
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
