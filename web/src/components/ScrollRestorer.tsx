"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  saveScrollPosition,
  getScrollPosition,
  markRestoreIntent,
  consumeRestoreIntent,
  clearBackNav,
} from "@/lib/scroll-history";

// needs a Suspense boundary around it somewhere cause of useSearchParams
export function ScrollRestorer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const restored = useRef(false);
  const pathKey = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  useEffect(() => {
    const onPop = () => markRestoreIntent();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    clearBackNav();
  }, [pathKey]);

  // saving on click capture, before Next navigates away, so we grab the real scroll spot
  useEffect(() => {
    const onClickCapture = () => saveScrollPosition(pathKey);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveScrollPosition(pathKey);
    };
    const onBeforeUnload = () => saveScrollPosition(pathKey);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [pathKey]);

  useEffect(() => {
    restored.current = false;
    // only restore on actual back nav, forward nav starts at top
    if (!consumeRestoreIntent()) return;
    const target = getScrollPosition(pathKey);
    if (target <= 0) return;

    // retries while waiting for layout/images to settle
    const tryScroll = (attempt = 0) => {
      if (restored.current) return;
      if (attempt > 15) return;
      const maxY = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      if (target < maxY || attempt >= 5) {
        window.scrollTo({ top: target, behavior: attempt < 3 ? "instant" : "smooth" });
        restored.current = true;
      } else {
        setTimeout(() => tryScroll(attempt + 1), 200 + attempt * 50);
      }
    };
    const onLoad = () => { if (!restored.current) tryScroll(10); };
    window.addEventListener("load", onLoad);
    tryScroll();
    return () => {
      window.removeEventListener("load", onLoad);
      restored.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  return null;
}
