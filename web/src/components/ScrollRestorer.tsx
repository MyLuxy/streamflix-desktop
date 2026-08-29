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

// All'interno di un componente React che usa useSearchParams serve Suspense.
export function ScrollRestorer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const restored = useRef(false);
  const pathKey = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  // Il back/forward del browser deve ripristinare lo scroll: segna l'intento
  // (markRestoreIntent imposta anche il flag back per saltare le animazioni hero).
  useEffect(() => {
    const onPop = () => markRestoreIntent();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Le hero leggono isBackNav() durante il render: dopo il commit azzeriamo il
  // flag, così la prossima navigazione in avanti torna ad animare normalmente.
  useEffect(() => {
    clearBackNav();
  }, [pathKey]);

  // Salva la posizione di scorrimento al momento del CLICK (fase di cattura,
  // quindi PRIMA che Next intercetti il link e navighi). Così catturiamo lo
  // scroll reale della pagina che stiamo lasciando, senza un listener continuo
  // che rischierebbe di salvare lo 0 del reset di Next per la pagina sbagliata.
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

  // Ripristina la posizione salvata quando si arriva sulla pagina (sia via
  // popstate che via router.push da DetailView).
  useEffect(() => {
    restored.current = false;
    // Ripristina lo scroll solo se si sta tornando indietro (back/forward o
    // tasto "Torna indietro"). Le navigazioni in avanti partono dall'alto.
    if (!consumeRestoreIntent()) return;
    const target = getScrollPosition(pathKey);
    if (target <= 0) return;

    // Tentativi progressivi per aspettare che layout + immagini siano pronti.
    const tryScroll = (attempt = 0) => {
      if (restored.current) return;
      if (attempt > 15) return; // rinuncia dopo ~3.5 secondi
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
    // Fallback su un load event per immagini ritardatarie
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
