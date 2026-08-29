// ─────────────────────────────────────────────────────────────
// Database della sezione hentai = il sito HOST (hentaimama.io).
// Così OGNI titolo mostrato è garantito riproducibile (lo stream lo serve
// lo stesso sito, vedi /api/hentai/resolve).
// Il catalogo viene fatto via scraping degli archivi Dooplay:
//   /tvshows/ (recenti) · /genre/{slug}/ · /studio/{slug}/ · /release/{anno}/
//   ricerca: /?s=...   (paginazione: /.../page/{n}/)
// Poster ufficiale + studio arrivano poi da AniList (vedi lib/anilist.ts),
// perché le card d'archivio non hanno lo studio e usano frame come poster.
// ─────────────────────────────────────────────────────────────

const BASE = "https://hentaimama.io";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const FETCH_TIMEOUT_MS = 5000; // 5s max per richiesta — se hentaimama è lento, non blocchiamo il sito

// Helper con timeout: evita che hentaimama lento blocchi tutto il sito.
// Accepta anche estensioni Next.js (next: { revalidate }).
async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit & { next?: { revalidate?: number } } = {}
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const { next, ...rest } = init;
  try {
    const res = await fetch(url, {
      ...rest,
      ...(next ? { next } : {}),
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Referer: `${BASE}/`, ...(init.headers || {}) },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export interface HentaiItem {
  id: number;
  slug: string;
  /** URL della scheda /tvshows/ — usato per risolvere lo stream. */
  url: string;
  name: string;
  poster: string | null;
  year: number | null;
  /** Voto del sito host (es. 8.7). */
  rating: number | null;
  /** Studio: riempito da AniList lato client (vuoto di default). */
  brand: string;
}

export interface HentaiSearchResult {
  items: HentaiItem[];
  page: number;
  hasMore: boolean;
}

export interface HentaiQuery {
  search?: string;
  genre?: string;
  studio?: string;
  year?: string;
  page?: number; // 1-based
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Id numerico stabile di un titolo hentai dal suo slug (per la watchlist). */
export function hentaiId(slug: string): number {
  return hashId(slug);
}

// Decodifica le entità HTML (numeriche &#8211; / &#x… e quelle nominate comuni).
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// Ripulisce il titolo: decodifica le entità e toglie il tag "3D – " iniziale
// (contenuti 3D, spesso fan-made, che il sito host etichetta così).
function cleanName(raw: string): string {
  return decodeEntities(raw)
    .replace(/^\s*3D\s*[–—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Estrae gli item dalle card d'archivio Dooplay (<article class="item tvshows">).
function parseArticles(html: string): HentaiItem[] {
  const blocks = html.match(/<article[^>]*class="item[^"]*tvshows[^"]*"[\s\S]*?<\/article>/g) || [];
  const seen = new Set<string>();
  const items: HentaiItem[] = [];
  for (const b of blocks) {
    const url = b.match(/href="(https:\/\/hentaimama\.io\/tvshows\/[a-z0-9-]+\/)"/)?.[1];
    if (!url) continue;
    const slug = url.match(/tvshows\/([a-z0-9-]+)\//)?.[1] || "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const poster =
      b.match(/data-src="([^"]+)"/)?.[1] ||
      b.match(/<img[^>]+src="(https:\/\/hentaimama[^"]+\.(?:jpg|png|webp)[^"]*)"/)?.[1] ||
      null;
    const name = cleanName(
      b.match(/<h3>\s*<a[^>]*>([^<]+)<\/a>/)?.[1] ||
        b.match(/alt="([^"]+)"/)?.[1] ||
        ""
    );
    if (!name) continue;
    const ratingStr = b.match(/class="rating"[^>]*>[\s\S]*?([0-9]+\.[0-9]+)/)?.[1];
    const yearStr = b.match(/<span>(\d{4})<\/span>/)?.[1];
    items.push({
      id: hashId(slug),
      slug,
      url,
      name,
      poster,
      year: yearStr ? Number(yearStr) : null,
      rating: ratingStr ? Number(ratingStr) : null,
      brand: "",
    });
  }
  return items;
}

// La ricerca Dooplay usa un markup diverso dagli archivi (<div class="result-item">).
function parseSearchResults(html: string): HentaiItem[] {
  const blocks = html.match(/<div class="result-item">[\s\S]*?<\/article>/g) || [];
  const seen = new Set<string>();
  const items: HentaiItem[] = [];
  for (const b of blocks) {
    const url = b.match(/href="(https:\/\/hentaimama\.io\/tvshows\/[a-z0-9-]+\/)"/)?.[1];
    if (!url) continue;
    const slug = url.match(/tvshows\/([a-z0-9-]+)\//)?.[1] || "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const poster = b.match(/<img[^>]+src="([^"]+)"/)?.[1] || null;
    const name = cleanName(
      b.match(/<div class="title">\s*<a[^>]*>([^<]+)<\/a>/)?.[1] ||
        b.match(/alt="([^"]+)"/)?.[1] ||
        ""
    );
    if (!name) continue;
    const ratingStr = b.match(/Rating:\s*([0-9]+(?:\.[0-9]+)?)/)?.[1];
    const yearStr = b.match(/class="year">\s*(\d{4})/)?.[1];
    items.push({
      id: hashId(slug),
      slug,
      url,
      name,
      poster,
      year: yearStr ? Number(yearStr) : null,
      rating: ratingStr ? Number(ratingStr) : null,
      brand: "",
    });
  }
  return items;
}

function archivePath(q: HentaiQuery): string {
  const n = q.page && q.page > 1 ? q.page : 1;
  const pg = n > 1 ? `page/${n}/` : "";
  if (q.search && q.search.trim()) {
    const s = encodeURIComponent(q.search.trim());
    return n > 1 ? `/page/${n}/?s=${s}` : `/?s=${s}`;
  }
  if (q.genre) return `/genre/${q.genre}/${pg}`;
  if (q.studio) return `/studio/${q.studio}/${pg}`;
  if (q.year) return `/release/${q.year}/${pg}`;
  return `/tvshows/${pg}`;
}

// ─── Scraping lato server (CORS-free). Usata da /api/hentai. ───
export async function hentaimamaList(q: HentaiQuery): Promise<HentaiSearchResult> {
  const page = q.page && q.page > 1 ? q.page : 1;
  const res = await fetchWithTimeout(`${BASE}${archivePath(q)}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return { items: [], page, hasMore: false };
  const html = await res.text();
  const items =
    q.search && q.search.trim() ? parseSearchResults(html) : parseArticles(html);
  // Heuristica "altri risultati": pagina piena ⇒ probabilmente c'è il next.
  const hasMore = items.length >= 18;
  return { items, page, hasMore };
}

// ─────────────────────────────────────────────────────────────
// Scheda dettaglio (pagina /tvshows/{slug}) → metadati + lista episodi.
// ─────────────────────────────────────────────────────────────

export interface HentaiEpisode {
  url: string;
  n: number;
  /** Thumbnail dell'episodio (snapshot del video su hentaimama). */
  thumb: string | null;
}

export interface HentaiDetail {
  slug: string;
  url: string;
  name: string;
  poster: string | null;
  synopsis: string;
  genres: string[];
  studio: string;
  year: number | null;
  rating: number | null;
  episodes: HentaiEpisode[];
}

// Cache in memoria lato server per evitare di scrapper hentaimama
// a ogni click sulla card. Vale 30 minuti.
const detailCache = new Map<string, { data: HentaiDetail | null; time: number }>();
const DETAIL_CACHE_TTL = 30 * 60 * 1000;

function parseEpisodes(html: string): HentaiEpisode[] {
  const seen = new Set<string>();
  const eps: HentaiEpisode[] = [];

  // Ogni episodio è un <article class="item se episodes"> con la sua thumbnail
  // (data-src) e il link /episodes/.../ dentro <div class="season_m">.
  const blocks = html.match(/<article[^>]*class="item se episodes"[\s\S]*?<\/article>/g) || [];
  for (const b of blocks) {
    const url = b.match(/href="(https:\/\/hentaimama\.io\/episodes\/[a-z0-9-]+\/)"/)?.[1];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const n = Number(url.match(/-episode-(\d+)\//)?.[1] || 1);
    const thumb =
      b.match(/<div class="poster">\s*<img[^>]+data-src="([^"]+)"/)?.[1] ||
      b.match(/<div class="poster">\s*<img[^>]+src="(https:\/\/hentaimama[^"]+\.(?:jpg|png|webp|jpeg)[^"]*)"/)?.[1] ||
      null;
    eps.push({ url, n, thumb });
  }

  // Fallback: se il markup degli article cambia, prende almeno i link episodio.
  if (eps.length === 0) {
    const re = /https:\/\/hentaimama\.io\/episodes\/[a-z0-9-]+\//g;
    for (const m of html.matchAll(re)) {
      const url = m[0];
      if (seen.has(url)) continue;
      seen.add(url);
      const n = Number(url.match(/-episode-(\d+)\//)?.[1] || 1);
      eps.push({ url, n, thumb: null });
    }
  }

  return eps.sort((a, b) => a.n - b.n);
}

export async function getHentaiDetail(slug: string): Promise<HentaiDetail | null> {
  // Cache check
  const cached = detailCache.get(slug);
  if (cached && Date.now() - cached.time < DETAIL_CACHE_TTL) {
    return cached.data;
  }

  const url = `${BASE}/tvshows/${slug}/`;
  const res = await fetchWithTimeout(url, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const name = cleanName(
    html.match(/<div class="data">\s*<h1>([^<]+)<\/h1>/)?.[1] ||
      html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
      slug
  );
  const poster =
    html.match(/<div class="poster">\s*<img[^>]+data-src="([^"]+)"/)?.[1] ||
    html.match(/<div class="poster">\s*<img[^>]+src="(https:\/\/hentaimama[^"]+\.(?:jpg|png|webp)[^"]*)"/)?.[1] ||
    null;
  const synopsis = decodeEntities(
    (html.match(/<div class="wp-content">\s*<p>([\s\S]*?)<\/p>/)?.[1] || "").replace(/<[^>]+>/g, "")
  ).trim();
  const genres = [
    ...new Set([...html.matchAll(/\/genre\/([a-z0-9-]+)\/"[^>]*rel="tag"/g)].map((m) => m[1])),
  ];
  const studioSlug = html.match(/\/studio\/([a-z0-9-]+)\//)?.[1];
  const studio =
    HENTAI_STUDIOS.find((s) => s.slug === studioSlug)?.name ||
    (studioSlug ? genreLabel(studioSlug) : "");
  const dateStr = html.match(/<span class="date">\s*([^<]+?)\s*<\/span>/)?.[1];
  const year =
    (dateStr && new Date(dateStr).getFullYear()) ||
    Number(html.match(/\/release\/(\d{4})/)?.[1]) ||
    null;
  const rating = Number(html.match(/dt_rating_vgs[^>]*>\s*([0-9.]+)/)?.[1]) || null;
  const episodes = parseEpisodes(html);

  const result: HentaiDetail = { slug, url, name, poster, synopsis, genres, studio, year, rating, episodes };

  // Salva in cache
  detailCache.set(slug, { data: result, time: Date.now() });

  return result;
}

// ─── Wrapper lato client (passa per la route same-origin /api/hentai). ───
export async function searchHentai(q: HentaiQuery): Promise<HentaiSearchResult> {
  const res = await fetch("/api/hentai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(q),
  });
  if (!res.ok) throw new Error(`/api/hentai ${res.status}`);
  return res.json();
}

/** Filtro combinato: AND tra categorie, OR dentro studio/anno. */
export interface HentaiCombinedFilter {
  genres?: string[];
  studios?: string[];
  years?: string[];
  search?: string;
}

export async function filterHentai(
  f: HentaiCombinedFilter
): Promise<{ items: HentaiItem[] }> {
  const res = await fetch("/api/hentai/filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(f),
  });
  if (!res.ok) throw new Error(`/api/hentai/filter ${res.status}`);
  return res.json();
}

/** URL della scheda sul sito host. */
export function hostWatchUrl(item: { url: string }): string {
  return item.url;
}

// ─────────────────────────────────────────────────────────────
// Configurazione UI
// ─────────────────────────────────────────────────────────────

export interface HentaiRowConfig {
  key: string;
  titleKey?: string;
  title?: string;
  query: HentaiQuery;
}

export const HENTAI_ROWS: HentaiRowConfig[] = [
  { key: "recent", titleKey: "hentai.rows.latest", query: {} },
  { key: "uncensored", titleKey: "hentai.rows.uncensored", query: { genre: "uncensored" } },
  { key: "harem", titleKey: "hentai.rows.harem", query: { genre: "harem" } },
  { key: "vanilla", titleKey: "hentai.rows.vanilla", query: { genre: "vanilla" } },
  { key: "large-breasts", titleKey: "hentai.rows.large-breasts", query: { genre: "large-breasts" } },
  { key: "ahegao", titleKey: "hentai.rows.ahegao", query: { genre: "ahegao" } },
  { key: "milf", titleKey: "hentai.rows.milf", query: { genre: "milf" } },
  { key: "school-girls", titleKey: "hentai.rows.school-girls", query: { genre: "school-girls" } },
  { key: "maid", titleKey: "hentai.rows.maid", query: { genre: "maid" } },
];

/**
 * Generi selezionabili nel filtro. Ogni voce è lo slug dell'archivio
 * hentaimama (/genre/{slug}/) — tutti verificati restituire 200.
 * Catalogo completo del sito host (ordine alfabetico).
 * Nota: alcuni slug del sito sono non standard (es. "cutefunny" attaccato,
 * "double-penatration" con refuso): vengono rimappati a etichetta corretta
 * in GENRE_LABEL_OVERRIDES.
 */
export const HENTAI_GENRES: string[] = [
  "3d", "action", "adventure", "ahegao", "anal", "animal-ears", "bdsm",
  "blackmail", "blowjob", "bondage", "brainwashed", "bukakke", "cat-girl",
  "comedy", "condom", "cosplay", "creampie", "cross-dressing", "cutefunny",
  "dark-skin", "deepthroat", "demons", "doctor", "domination",
  "double-penatration", "drama", "dubbed", "ecchi",
  "elf", "eroge", "facesitting", "facial", "fantasy", "female-doctor",
  "female-teacher", "femdom", "footjob", "furry", "futanari", "gangbang",
  "gyaru", "harem", "historical", "horny-slut", "housewife", "humiliation",
  "inflation", "internal-cumshot", "lactation", "large-breasts", "magical-girls",
  "maid", "martial-arts", "megane", "milf", "mind-break", "molestation",
  "nipple-fuck", "non-japanese", "ntr", "nuns", "nurses", "office-ladies",
  "orc", "police", "pov", "pregnant", "princess", "public-sex", "rape",
  "rim-job", "romance", "scat", "school-girls", "sci-fi", "shimapan", "short",
  "sports", "squirting", "step-daughter", "step-mother", "step-sister",
  "stocking", "strap-on", "succubus", "super-power", "supernatural", "swimsuit",
  "tentacles", "three-some", "tits-fuck", "toys", "train-molestation",
  "tsundere", "uncensored", "urination", "vampire", "vanilla", "virgins",
  "widow", "x-ray", "yuri",
];

/** Studi (slug archivio /studio/{slug}/ → nome) — catalogo completo hentaimama. */
export const HENTAI_STUDIOS: { slug: string; name: string }[] = [
  { slug: "8bit", name: "8bit" },
  { slug: "actas", name: "Actas" },
  { slug: "active", name: "Active" },
  { slug: "aic", name: "AIC" },
  { slug: "aic-a-s-t-a", name: "AIC A.S.T.A." },
  { slug: "alice-soft", name: "Alice Soft" },
  { slug: "an-dercen", name: "An DerCen" },
  { slug: "angelfish", name: "Angelfish" },
  { slug: "animac", name: "Animac" },
  { slug: "animan", name: "AniMan" },
  { slug: "animax", name: "Animax" },
  { slug: "animefesta", name: "AnimeFesta" },
  { slug: "antechinus", name: "Antechinus" },
  { slug: "appp", name: "APPP" },
  { slug: "armor", name: "Armor" },
  { slug: "arms", name: "Arms" },
  { slug: "asahi-production", name: "Asahi Production" },
  { slug: "at-2", name: "AT-2" },
  { slug: "blue-eyes", name: "Blue Eyes" },
  { slug: "bomb-cute-bomb", name: "BOMB! CUTE! BOMB!" },
  { slug: "bootleg", name: "BOOTLEG" },
  { slug: "bunnywalker", name: "Bunnywalker" },
  { slug: "central-park-media", name: "Central Park Media" },
  { slug: "cherrylips", name: "CherryLips" },
  { slug: "chichinoya", name: "ChiChinoya" },
  { slug: "chippai", name: "Chippai" },
  { slug: "chuchu", name: "ChuChu" },
  { slug: "circle-tribute", name: "Circle Tribute" },
  { slug: "clockup", name: "CLOCKUP" },
  { slug: "collaboration-works", name: "Collaboration Works" },
  { slug: "comic-media", name: "Comic Media" },
  { slug: "cosmic-ray", name: "Cosmic Ray" },
  { slug: "cosmo", name: "Cosmo" },
  { slug: "cotton-doll", name: "Cotton Doll" },
  { slug: "cranberry", name: "Cranberry" },
  { slug: "d3", name: "D3" },
  { slug: "daiei", name: "Daiei" },
  { slug: "digital-works", name: "Digital Works" },
  { slug: "discovery", name: "Discovery" },
  { slug: "dream-force", name: "Dream Force" },
  { slug: "dubbed", name: "Dubbed" },
  { slug: "easy-film", name: "Easy Film" },
  { slug: "echo", name: "Echo" },
  { slug: "edge", name: "EDGE" },
  { slug: "filmlink-international", name: "Filmlink International" },
  { slug: "five-ways", name: "Five Ways" },
  { slug: "front-line", name: "Front Line" },
  { slug: "frontier-works", name: "Frontier Works" },
  { slug: "godoy", name: "Godoy" },
  { slug: "gold-bear", name: "Gold Bear" },
  { slug: "green-bunny", name: "Green Bunny" },
  { slug: "himajin-planning", name: "Himajin Planning" },
  { slug: "hokiboshi", name: "Hokiboshi" },
  { slug: "hoods-entertainment", name: "Hoods Entertainment" },
  { slug: "horipro", name: "Horipro" },
  { slug: "hot-bear", name: "Hot Bear" },
  { slug: "hydrafxx", name: "HydraFXX" },
  { slug: "innocent-grey", name: "Innocent Grey" },
  { slug: "jam", name: "Jam" },
  { slug: "japananime", name: "JapanAnime" },
  { slug: "juicymango", name: "Juicymango" },
  { slug: "king-bee", name: "King Bee" },
  { slug: "kitty-films", name: "Kitty Films" },
  { slug: "kitty-media", name: "Kitty Media" },
  { slug: "knack-productions", name: "Knack Productions" },
  { slug: "kss", name: "KSS" },
  { slug: "lemon-heart", name: "Lemon Heart" },
  { slug: "lune-pictures", name: "Lune Pictures" },
  { slug: "majin", name: "Majin" },
  { slug: "marvelous-entertainment", name: "Marvelous Entertainment" },
  { slug: "mary-jane", name: "Mary Jane" },
  { slug: "media", name: "Media" },
  { slug: "media-blasters", name: "Media Blasters" },
  { slug: "milkshake", name: "Milkshake" },
  { slug: "mitsu", name: "Mitsu" },
  { slug: "moonstone-cherry", name: "Moonstone Cherry" },
  { slug: "mousou-senka", name: "Mousou Senka" },
  { slug: "ms-pictures", name: "MS Pictures" },
  { slug: "nag", name: "Nag" },
  { slug: "nihikime-no-dozeu", name: "Nihikime no Dozeu" },
  { slug: "no-future", name: "No Future" },
  { slug: "nur", name: "Nur" },
  { slug: "nutech-digital", name: "NuTech Digital" },
  { slug: "obtain-future", name: "Obtain Future" },
  { slug: "office-take-off", name: "Office Take Off" },
  { slug: "ole-m", name: "OLE-M" },
  { slug: "oriental-light-and-magic", name: "Oriental Light and Magic" },
  { slug: "oz", name: "Oz" },
  { slug: "pashmina", name: "Pashmina" },
  { slug: "pink-pineapple", name: "Pink Pineapple" },
  { slug: "pixy", name: "Pixy" },
  { slug: "poro", name: "PoRO" },
  { slug: "production-i-g", name: "Production I.G" },
  { slug: "queen-bee", name: "Queen Bee" },
  { slug: "rojiura-jack", name: "Rojiura Jack" },
  { slug: "sakura-purin-animation", name: "Sakura Purin Animation" },
  { slug: "schoolzone", name: "Schoolzone" },
  { slug: "selfish", name: "Selfish" },
  { slug: "seven", name: "Seven" },
  { slug: "shelf", name: "Shelf" },
  { slug: "shinkuukan", name: "Shinkuukan" },
  { slug: "shinyusha", name: "Shinyusha" },
  { slug: "shouten", name: "Shouten" },
  { slug: "silkys", name: "Silky's" },
  { slug: "sodeno19", name: "Sodeno19" },
  { slug: "soft-garage", name: "Soft Garage" },
  { slug: "softcel-pictures", name: "SoftCel Pictures" },
  { slug: "speed", name: "SPEED" },
  { slug: "studio-9-maiami", name: "Studio 9 Maiami" },
  { slug: "studio-eromatick", name: "Studio Eromatick" },
  { slug: "studio-fantasia", name: "Studio Fantasia" },
  { slug: "studio-jack", name: "Studio Jack" },
  { slug: "studio-kyuuma", name: "Studio Kyuuma" },
  { slug: "studio-matrix", name: "Studio Matrix" },
  { slug: "studio-sign", name: "Studio Sign" },
  { slug: "studio-tulip", name: "Studio Tulip" },
  { slug: "studio-unicorn", name: "Studio Unicorn" },
  { slug: "suzuki-mirano", name: "Suzuki Mirano" },
  { slug: "t-rex", name: "T-Rex" },
  { slug: "the-right-stuf-international", name: "The Right Stuf International" },
  { slug: "toho-company", name: "Toho Company" },
  { slug: "top-marschal", name: "Top-Marschal" },
  { slug: "toranoana", name: "Toranoana" },
  { slug: "torudaya", name: "Torudaya" },
  { slug: "toshiba-entertainment", name: "Toshiba Entertainment" },
  { slug: "triangle-bitter", name: "Triangle Bitter" },
  { slug: "triple-x", name: "Triple X" },
  { slug: "umemaro3d", name: "Umemaro3D" },
  { slug: "union-cho", name: "Union Cho" },
  { slug: "valkyria", name: "Valkyria" },
  { slug: "white-bear", name: "White Bear" },
  { slug: "y-o-u-c", name: "Y.O.U.C" },
  { slug: "ziz-entertainment", name: "ZIZ Entertainment" },
  { slug: "zyc", name: "Zyc" },
];

/** Etichetta leggibile da uno slug genere ("large-breasts" → "Large Breasts"). */
// Etichette speciali: sigle e nomi che la capitalizzazione automatica non
// renderebbe bene (es. "bdsm" → "Bdsm"). Solo questi slug vengono sovrascritti.
const GENRE_LABEL_OVERRIDES: Record<string, string> = {
  "3d": "3D",
  bdsm: "BDSM",
  ntr: "NTR",
  pov: "POV",
  milf: "MILF",
  deepthroat: "DeepThroat",
  "sci-fi": "Sci-Fi",
  "x-ray": "X-Ray",
  "non-japanese": "Non-Japanese",
  "animal-ears": "Animal Girls",
  orc: "Orc/Goblin",
  cutefunny: "Cute & Funny",
  "double-penatration": "Double Penetration",
};

export function genreLabel(slug: string): string {
  return (
    GENRE_LABEL_OVERRIDES[slug] ||
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export const HENTAI_YEARS: number[] = Array.from(
  { length: new Date().getFullYear() - 1999 },
  (_, i) => new Date().getFullYear() - i
);
