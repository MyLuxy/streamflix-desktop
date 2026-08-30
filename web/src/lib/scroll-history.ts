const scrollPositions = new Map<string, number>();

export function saveScrollPosition(path: string) {
  if (typeof window === "undefined") return;
  const y = window.scrollY;
  scrollPositions.set(path, y);
  try {
    sessionStorage.setItem(`scroll:${path}`, String(y));
  } catch { /* quota exceeded, not fatal */ }
}

export function getScrollPosition(path: string): number {
  const fromMap = scrollPositions.get(path);
  if (fromMap !== undefined) return fromMap;
  if (typeof window === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(`scroll:${path}`)) || 0;
  } catch {
    return 0;
  }
}

export function clearScrollPosition(path: string) {
  scrollPositions.delete(path);
  try {
    sessionStorage.removeItem(`scroll:${path}`);
  } catch { /* ignore */ }
}

// only set on an actual back nav, not forward clicks, so new pages start scrolled to top
let restoreIntent = false;
export function markRestoreIntent() {
  restoreIntent = true;
  backNav = true;
}
export function consumeRestoreIntent(): boolean {
  const v = restoreIntent;
  restoreIntent = false;
  return v;
}

// heroes read this to skip their entrance animation when returning to a page already seen
let backNav = false;
export function markBackNav() {
  backNav = true;
}
export function isBackNav(): boolean {
  return backNav;
}
export function clearBackNav() {
  backNav = false;
}
