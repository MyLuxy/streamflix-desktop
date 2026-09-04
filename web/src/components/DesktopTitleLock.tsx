"use client";

import { useEffect } from "react";

const APP_TITLE = "StreamFlix";

// desktop windows dont need seo titles, so pin the title bar/taskbar
// to just "StreamFlix" no matter what next sets per page
export function DesktopTitleLock() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.streamflixDesktop) return;

    document.title = APP_TITLE;

    // watch <head> itself, not the <title> node directly - next.js replaces the whole
    // title element on route changes rather than editing its text in place, so an
    // observer attached to that specific (now-detached) node goes silently dead after
    // the first navigation and every later page's seo title leaks into the title bar
    const observer = new MutationObserver(() => {
      if (document.title !== APP_TITLE) document.title = APP_TITLE;
    });
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
