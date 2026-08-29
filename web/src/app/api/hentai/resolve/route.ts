import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// Resolver di streaming hentai → scraping di hentaimama.io.
// Catena: /tvshows/{slug} → /episodes/{ep} → post id
//   → admin-ajax (get_player_contents) → new2.php?p=<base64>
//   → mp4 diretto (es. https://gdvid.info/.../file.mp4).
// ─────────────────────────────────────────────────────────────

const BASE = "https://hentaimama.io";
const FETCH_TIMEOUT_MS = 10000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function getText(url: string, init?: RequestInit): Promise<string> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "User-Agent": UA, Referer: `${BASE}/` };
    // Unisce gli headers custom (es. POST con Content-Type specifico).
    if (init?.headers) Object.assign(headers, init.headers);
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers,
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(id);
  }
}

function uniqMatches(re: RegExp, s: string): string[] {
  return [...new Set([...s.matchAll(re)].map((m) => m[0]))];
}

interface Episode {
  url: string;
  n: number;
  label: string;
}

function episodesFrom(tvHtml: string): Episode[] {
  const urls = uniqMatches(/https:\/\/hentaimama\.io\/episodes\/[a-z0-9-]+\//g, tvHtml);
  return urls
    .map((url) => {
      const m = url.match(/-episode-(\d+)\//);
      const n = m ? Number(m[1]) : 1;
      return { url, n, label: `Episodio ${n}` };
    })
    .sort((a, b) => a.n - b.n);
}

// Da una pagina episodio → mp4 diretto.
async function resolveEpisode(episodeUrl: string): Promise<string | null> {
  const epHtml = await getText(episodeUrl);
  const postId = epHtml.match(/a:'(\d+)'/)?.[1];
  if (!postId) return null;

  const ajax = await getText(`${BASE}/wp-admin/admin-ajax.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: episodeUrl,
    },
    body: `action=get_player_contents&a=${postId}`,
  });

  // L'ajax torna un array JSON di <iframe ... src="...new2.php?p=...">
  const iframe =
    ajax.match(/https?:\\?\/\\?\/hentaimama\.io\\?\/new2\.php\?p=[^"\\]+/)?.[0] ||
    ajax.match(/https?:\\?\/\\?\/hentaimama\.io\\?\/newjav\.php\?p=[^"\\]+/)?.[0];
  if (!iframe) return null;
  const playerUrl = iframe.replace(/\\\//g, "/");

  const playerHtml = await getText(playerUrl, { headers: { Referer: episodeUrl } });
  const mp4 = playerHtml.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/)?.[0];
  return mp4 || null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const epUrl = searchParams.get("epUrl");
  const tv = searchParams.get("tv");
  const q = (searchParams.get("q") || "").trim();

  try {
    // Risoluzione diretta di un episodio noto (cambio episodio dalla UI).
    if (epUrl && epUrl.startsWith(`${BASE}/episodes/`)) {
      const mp4 = await resolveEpisode(epUrl);
      return NextResponse.json({ ok: !!mp4, mp4, episodeUrl: epUrl });
    }

    // Risoluzione diretta da una scheda /tvshows/ (catalogo = sito host).
    if (tv && tv.startsWith(`${BASE}/tvshows/`)) {
      const tvHtml = await getText(tv);
      const eps = episodesFrom(tvHtml);
      if (eps.length === 0) return NextResponse.json({ ok: false, error: "no episodes" });
      const mp4 = await resolveEpisode(eps[0].url);
      return NextResponse.json({
        ok: !!mp4,
        mp4,
        episodeUrl: eps[0].url,
        episodes: eps,
        source: tv,
      });
    }

    if (!q) return NextResponse.json({ ok: false, error: "missing q" }, { status: 400 });

    // Ripulisce il titolo (toglie numero finale, "the animation", ecc.).
    const cleaned = q
      .replace(/\bthe animation\b/gi, "")
      .replace(/\s+\d+$/, "")
      .replace(/[:–-].*$/, "")
      .trim();

    const search = await getText(`${BASE}/?s=${encodeURIComponent(cleaned || q)}`);
    const tvUrls = uniqMatches(/https:\/\/hentaimama\.io\/tvshows\/[a-z0-9-]+\//g, search);

    // Anche la ricerca può linkare direttamente degli episodi.
    let episodes: Episode[] = [];
    if (tvUrls.length > 0) {
      const tvHtml = await getText(tvUrls[0]);
      episodes = episodesFrom(tvHtml);
    } else {
      episodes = episodesFrom(search);
    }
    if (episodes.length === 0) {
      return NextResponse.json({ ok: false, error: "not found" });
    }

    const mp4 = await resolveEpisode(episodes[0].url);
    return NextResponse.json({
      ok: !!mp4,
      mp4,
      episodeUrl: episodes[0].url,
      episodes,
      source: tvUrls[0] ?? episodes[0].url,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "resolve failed" },
      { status: 502 }
    );
  }
}
