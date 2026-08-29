"use client";

import { useEffect, useState } from "react";
import { isBackNav } from "@/lib/scroll-history";

/**
 * Gestisce l'ingresso delle hero in modo uniforme:
 *  - "torna indietro" (back/forward o tasto Indietro): nessuna animazione,
 *    la hero è rivelata subito (instant = true);
 *  - navigazione normale: sfondo neutro finché il contenuto non è pronto,
 *    poi dissolvenza morbida (revealed passa da false a true).
 *
 * @param ready  true quando il contenuto principale è pronto (es. immagine di
 *               sfondo caricata). Per le hero a griglia, lasciare il default:
 *               si rivela al primo frame, mostrando prima lo sfondo neutro.
 */
export function useHeroEntrance(ready: boolean = true) {
  // Catturato UNA sola volta al mount, durante il render: se siamo arrivati
  // con un "torna indietro", saltiamo tutto.
  const [instant] = useState(() => isBackNav());
  const [revealed, setRevealed] = useState(instant);

  useEffect(() => {
    if (instant || revealed) return;
    if (ready) {
      // Un frame di ritardo: lo sfondo neutro viene dipinto prima di rivelare.
      const id = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(id);
    }
    // Sicurezza: se "ready" non arriva mai (immagine che non scatta onLoad,
    // errore di rete, ecc.) riveliamo comunque dopo un breve timeout, così la
    // hero non resta mai invisibile.
    const t = setTimeout(() => setRevealed(true), 1500);
    return () => clearTimeout(t);
  }, [instant, revealed, ready]);

  return { revealed, instant };
}
