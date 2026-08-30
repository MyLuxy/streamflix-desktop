export function slugify(input: string): string {
  return (input || "")
    .toString()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildSlug(id: number, title: string): string {
  const s = slugify(title);
  return s ? `${id}-${s}` : `${id}`;
}

export function parseIdFromSlug(slug: string): number | null {
  const match = (slug || "").match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// mostly-japanese titles like "Re:ゼロから始める異世界生活" would slugify down to just "re"
export function isMostlyLatin(title: string): boolean {
  if (!title) return false;
  const latin = (title.match(/[a-zA-Z0-9]/g) || []).length;
  return latin / title.length >= 0.5;
}

export function slugWithFallback(
  id: number,
  original: string,
  fallback?: string
): string {
  if (isMostlyLatin(original)) return buildSlug(id, original);
  if (fallback && isMostlyLatin(fallback)) return buildSlug(id, fallback);
  return buildSlug(id, "");
}

// a numeric hash cant survive a navigation, no server memory to map it back. encode
// provider+id right into the token so the url itself is the source of truth
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

// dot separator, doesnt appear in base64url or slugify output so no ambiguity splitting it back
export function buildProviderSlug(provider: string, id: string, title: string): string {
  const token = encodeProviderId(provider, id);
  const s = slugify(title);
  return s ? `${token}.${s}` : token;
}

export function parseProviderIdFromSlug(slug: string): { provider: string; id: string } | null {
  const token = (slug || "").split(".")[0];
  return token ? decodeProviderId(token) : null;
}
