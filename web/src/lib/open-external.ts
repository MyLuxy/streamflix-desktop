import type { MouseEvent } from "react";

// desktop app sends external links to the user's default browser instead of an electron window
export function openExternalLink(e: MouseEvent<HTMLAnchorElement>) {
  if (!window.streamflixDesktop) return;
  e.preventDefault();
  window.streamflixDesktop.openExternal(e.currentTarget.href);
}
