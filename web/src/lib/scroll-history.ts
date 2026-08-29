// Memorizza le posizioni di scorrimento per ogni pagina visitata,
// così il tasto "Torna indietro" riporta al punto esatto in cui si era.

const scrollPositions = new Map<string, number>();

export function saveScrollPosition(path: string) {
  if (typeof window === "undefined") return;
  const y = window.scrollY;
  scrollPositions.set(path, y);
  try {
    sessionStorage.setItem(`scroll:${path}`, String(y));
  } catch { /* quota exceeded — non fatale */ }
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

// Intento di ripristino scroll: viene segnato solo quando si torna indietro
// (back del browser o tasto "Torna indietro"), NON quando si naviga in avanti
// (es. click su "Vedi tutto" o su un titolo). Così le pagine nuove partono
// dall'alto e solo il "back" ripristina la posizione precedente.
let restoreIntent = false;
export function markRestoreIntent() {
  restoreIntent = true;
  // Ogni "torna indietro" è anche un back per le hero (vedi sotto).
  backNav = true;
}
export function consumeRestoreIntent(): boolean {
  const v = restoreIntent;
  restoreIntent = false;
  return v;
}

// Indica se la navigazione corrente è un "torna indietro" (back/forward del
// browser o tasto "Torna indietro"). Le hero lo leggono al mount per saltare
// l'animazione d'ingresso quando si rientra in una pagina già vista.
// A differenza di restoreIntent (consumato dallo ScrollRestorer), questo viene
// solo letto dalle hero e azzerato dallo ScrollRestorer dopo il render.
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
