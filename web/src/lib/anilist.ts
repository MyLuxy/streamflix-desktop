// ─────────────────────────────────────────────────────────────
// Arricchimento hentai: cover ufficiale + studio da AniList.
// Batch query con cache di processo e retry su 429.
// NIENTE mutex globale o throttle fisso — si affida ai Retry-After
// di AniList e batch da 20 titoli per non saturare il rate limit.
// ─────────────────────────────────────────────────────────────

const ANILIST_URL = "https://graphql.anilist.co";

export interface AniMeta {
  cover: string | null;
  studio: string | null;
}

// Cache di processo: titolo pulito → { cover, studio } (o null se nessun match).
const metaCache = new Map<string, AniMeta | null>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Toglie il numero di episodio finale ("Master Piece 1" → "Master Piece"). */
export function cleanForAniList(name: string): string {
  return name
    .replace(/\bthe animation\b/gi, "")
    .replace(/\s+\d+$/, "")
    .trim();
}

// Esegue un batch verso AniList. Su 429 fa un retry con Retry-After.
// Ritorna true se l'esito è definitivo e già messo in cache.
async function fetchBatch(names: string[]): Promise<boolean> {
  const parts = names.map(
    (_, i) =>
      `m${i}: Media(search:$s${i}, type:ANIME, isAdult:true){ coverImage{ extraLarge large } studios(isMain:true){ nodes{ name } } }`
  );
  const varDecl = names.map((_, i) => `$s${i}:String`).join(",");
  const query = `query(${varDecl}){${parts.join(" ")}}`;
  const variables = Object.fromEntries(names.map((n, i) => [`s${i}`, n]));
  const body = JSON.stringify({ query, variables });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        cache: "no-store",
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 2;
        await sleep(Math.min(ra, 10) * 1000);
        continue;
      }
      if (!res.ok) return false;
      const data = await res.json();
      const d = data?.data ?? {};
      names.forEach((n, i) => {
        const m = d[`m${i}`];
        if (!m) { metaCache.set(n, null); return; }
        metaCache.set(n, {
          cover: m.coverImage?.large || m.coverImage?.extraLarge || null,
          studio: m.studios?.nodes?.[0]?.name || null,
        });
      });
      return true;
    } catch {
      if (attempt === 0) { await sleep(500); continue; }
      return false;
    }
  }
  return false;
}

/** Mappa titoli → { cover, studio } AniList (solo quelli trovati). */
export async function anilistMeta(rawNames: string[]): Promise<Map<string, AniMeta>> {
  const cleaned = [...new Set(rawNames.map(cleanForAniList).filter(Boolean))];
  const missing = cleaned.filter((n) => !metaCache.has(n));

  const BATCH = 20;
  // Batch concorrenti (Promise.all, niente mutex globale). AniList gestisce
  // fino a 30 req/min; con batch da 20 titoli, un hub intero cabe in 1-2 req.
  await Promise.all(
    Array.from({ length: Math.ceil(missing.length / BATCH) }, (_, i) =>
      fetchBatch(missing.slice(i * BATCH, (i + 1) * BATCH))
    )
  );

  const out = new Map<string, AniMeta>();
  for (const raw of rawNames) {
    const meta = metaCache.get(cleanForAniList(raw));
    if (meta && (meta.cover || meta.studio)) out.set(raw, meta);
  }
  return out;
}

// ─── Dettaglio completo da AniList ──────────────────────────

export interface AniDetailResult {
  name: string;
  poster: string | null;
  synopsis: string;
  genres: string[];
  studio: string;
  year: number | null;
  rating: number | null;
}

const detailCache = new Map<string, AniDetailResult | null>();

async function fetchDetail(name: string): Promise<AniDetailResult | null> {
  const query = `query($s:String){
    Media(search:$s, type:ANIME, isAdult:true){
      title{ romaji english }
      coverImage{ extraLarge large }
      description
      genres
      studios(isMain:true){ nodes{ name } }
      startDate{ year }
      averageScore
    }
  }`;
  const body = JSON.stringify({ query, variables: { s: name } });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        cache: "no-store",
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 2;
        await sleep(Math.min(ra, 10) * 1000);
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      const m = data?.data?.Media;
      if (!m) return null;

      const title = m.title?.romaji || m.title?.english || name;
      return {
        name: title,
        poster: m.coverImage?.extraLarge || m.coverImage?.large || null,
        synopsis: m.description ? m.description.replace(/<[^>]+>/g, "").trim() : "",
        genres: (m.genres || []) as string[],
        studio: m.studios?.nodes?.[0]?.name || "",
        year: m.startDate?.year || null,
        rating: m.averageScore != null ? m.averageScore / 10 : null,
      };
    } catch {
      if (attempt === 0) { await sleep(500); continue; }
      return null;
    }
  }
  return null;
}

/** Dettaglio completo AniList per un titolo. Cache interna di 30 min. */
export async function anilistDetail(name: string): Promise<AniDetailResult | null> {
  const cleaned = cleanForAniList(name);
  if (!cleaned) return null;

  const cached = detailCache.get(cleaned);
  if (cached !== undefined) return cached;

  const result = await fetchDetail(cleaned);
  detailCache.set(cleaned, result);
  return result;
}
