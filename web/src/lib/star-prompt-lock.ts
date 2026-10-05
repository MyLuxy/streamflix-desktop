import { useSyncExternalStore } from "react";

let starPromptOpen = false;
const listeners = new Set<() => void>();

export function setStarPromptOpen(open: boolean) {
  starPromptOpen = open;
  listeners.forEach((listener) => listener());
}

// lets the update modal wait while the star prompt is up instead of stacking on top of it
export function useStarPromptOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => starPromptOpen,
    () => false,
  );
}
