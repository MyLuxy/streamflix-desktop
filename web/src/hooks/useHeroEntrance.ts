"use client";

import { useEffect, useState } from "react";
import { isBackNav } from "@/lib/scroll-history";

// on back nav skip the fade in, otherwise wait for ready then fade
export function useHeroEntrance(ready: boolean = true) {
  const [instant] = useState(() => isBackNav());
  const [revealed, setRevealed] = useState(instant);

  useEffect(() => {
    if (instant || revealed) return;
    if (ready) {
      const id = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(id);
    }
    // fallback timeout in case ready never fires (bad image, network etc)
    const t = setTimeout(() => setRevealed(true), 1500);
    return () => clearTimeout(t);
  }, [instant, revealed, ready]);

  return { revealed, instant };
}
