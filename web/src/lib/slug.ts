// Genera uno slug SEO-friendly da un titolo: "Il Signore degli Anelli" -> "il-signore-degli-anelli"
export function slugify(input: string): string {
  return (input || "")
    .toString()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // rimuove accenti (diacritici combinanti)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Costruisce lo slug completo "{id}-{titolo}" usato negli URL: /film/27205-inception
export function buildSlug(id: number, title: string): string {
  const s = slugify(title);
  return s ? `${id}-${s}` : `${id}`;
}

// Estrae l'id TMDB dalla prima parte dello slug "27205-inception" -> 27205
export function parseIdFromSlug(slug: string): number | null {
  const match = (slug || "").match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Verifica se un titolo è prevalentemente in caratteri latini.
// Evita slug inutili per titoli non latini (es. anime giapponesi, dove
// "Re:ゼロから始める異世界生活" produrrebbe solo "re").
export function isMostlyLatin(title: string): boolean {
  if (!title) return false;
  const latin = (title.match(/[a-zA-Z0-9]/g) || []).length;
  return latin / title.length >= 0.5;
}

// Slug dal titolo originale se latino, altrimenti dal fallback (titolo inglese).
// Se nessuno è latino -> solo id.
export function slugWithFallback(
  id: number,
  original: string,
  fallback?: string
): string {
  if (isMostlyLatin(original)) return buildSlug(id, original);
  if (fallback && isMostlyLatin(fallback)) return buildSlug(id, fallback);
  return buildSlug(id, "");
}

// ─── provider+id token (StreamFlix backend) ──────────────────────────────────
// A numeric-hash-only id can't survive a page navigation: the home page and the detail page it
// links to are two separate HTTP requests, so whatever in-memory registry mapped that hash back
// to a real (provider, id) pair on the FIRST request is simply gone by the second one. Encoding
// provider+id directly into the slug's own token sidesteps that: the URL itself is now the
// source of truth, no server-side memory required to resolve it.
function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

export function encodeProviderId(provider: string, id: string): string {
  return toBase64Url(`${provider}:${id}`);
}

export function decodeProviderId(token: string): { provider: string; id: string } | null {
  try {
    const raw = fromBase64Url(token);
    const idx = raw.indexOf(":");
    if (idx < 0) return null;
    return { provider: raw.slice(0, idx), id: raw.slice(idx + 1) };
  } catch {
    return null;
  }
}

// "{token}.{titolo-slug}" - un punto come separatore perché non compare né nell'alfabeto
// base64url né nell'output di slugify, quindi non c'è ambiguità nello split.
export function buildProviderSlug(provider: string, id: string, title: string): string {
  const token = encodeProviderId(provider, id);
  const s = slugify(title);
  return s ? `${token}.${s}` : token;
}

export function parseProviderIdFromSlug(slug: string): { provider: string; id: string } | null {
  const token = (slug || "").split(".")[0];
  return token ? decodeProviderId(token) : null;
}
