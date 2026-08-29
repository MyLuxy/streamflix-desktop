// Stack delle pagine visitate nell'app, per un "Torna indietro" affidabile e
// cronologico che non dipenda da history.back() (gli iframe dei player sporcano
// la cronologia del browser con redirect/pubblicità).
const MAX = 50;
const stack: string[] = [];

// Quando si torna indietro in modo programmatico (router.push del tasto back),
// il successivo recordPath NON deve impilare di nuovo: si allinea soltanto.
let suppressNextPush = false;

// Confronta solo la parte di percorso senza query string.
const pathnameOf = (p: string) => p.split("?")[0];

// Estrae tipo (film/serie) e ID per riconoscere i redirect canonici.
// /it/film/123-titolo → { type: "film", id: "123", slug: "123-titolo" }
const routeInfo = (p: string) => {
  const parts = pathnameOf(p).split("/").filter(Boolean);
  if (parts.length >= 3) {
    const slug = parts[2] || "";
    return { type: parts[1], id: slug.split("-")[0], slug };
  }
  return null;
};

export function recordPath(path: string) {
  // Navigazione "indietro" appena eseguita dal tasto: allinea la cima e basta.
  if (suppressNextPush) {
    suppressNextPush = false;
    if (stack.length) stack[stack.length - 1] = path;
    else stack.push(path);
    return;
  }

  const top = stack[stack.length - 1];
  if (path === top) return;

  // Stesso pathname, query diversa (es. ricerca mentre si digita): aggiorna la cima.
  if (top && pathnameOf(top) === pathnameOf(path)) {
    stack[stack.length - 1] = path;
    return;
  }

  // Redirect canonico (stesso tipo e ID, slug diverso): sostituisce la cima.
  const cur = routeInfo(path);
  const prev = top ? routeInfo(top) : null;
  if (cur && prev && cur.type === prev.type && cur.id === prev.id && cur.slug !== prev.slug) {
    stack[stack.length - 1] = path;
    return;
  }

  // Back del browser (popstate): se il path coincide con la penultima entry,
  // è un "indietro" → pop.
  if (stack.length >= 2 && pathnameOf(stack[stack.length - 2]) === pathnameOf(path)) {
    stack.pop();
    stack[stack.length - 1] = path;
    return;
  }

  // Navigazione in avanti: impila.
  stack.push(path);
  if (stack.length > MAX) stack.shift();
}

// Anteprima della pagina precedente senza modificare lo stack.
export function getPreviousPath(): string {
  return stack.length >= 2 ? stack[stack.length - 2] : "";
}

// Esegue un "indietro" esplicito: rimuove la pagina corrente dallo stack e
// restituisce quella precedente. Da usare dai tasti "Torna indietro".
// Imposta suppressNextPush così il recordPath innescato dal router.push non
// impilerà di nuovo la pagina (evita i loop A↔B).
export function popPreviousPath(): string {
  if (stack.length >= 2) {
    stack.pop();
    suppressNextPush = true;
    return stack[stack.length - 1];
  }
  return "";
}
