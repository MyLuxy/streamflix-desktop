"use client";

import { useEffect, useLayoutEffect } from "react";
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

  // layout effect so this lands before the browser ever paints the fresh page at scroll 0
  useLayoutEffect(() => {
    // only restore on actual back nav, forward nav starts at top
    if (!consumeRestoreIntent()) return;
    const target = getScrollPosition(pathKey);
    if (target <= 0) return;

    let settled = false;
    let userTookOver = false;

    const maxScrollable = () =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;

    const attempt = () => {
      if (settled || userTookOver) return;
      window.scrollTo(0, target);
      if (maxScrollable() >= target) {
        settled = true;
        cleanup();
      }
    };

    // a real scroll input while were still homing in means the user is driving now, dont fight them
    const onUserScroll = () => {
      userTookOver = true;
      cleanup();
    };

    const observer = new ResizeObserver(attempt);
    observer.observe(document.body);
    const giveUpTimer = setTimeout(() => {
      settled = true;
      cleanup();
    }, 4000);

    function cleanup() {
      observer.disconnect();
      clearTimeout(giveUpTimer);
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchmove", onUserScroll);
    }

    window.addEventListener("wheel", onUserScroll, { passive: true });
    window.addEventListener("touchmove", onUserScroll, { passive: true });

    attempt();
    return cleanup;
  }, [pathKey]);

  return null;
}
