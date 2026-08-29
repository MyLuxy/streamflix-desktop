import { discoverMoviesPage, discoverTVPage } from "@/lib/streamflix";
import { getSelectedProvider } from "@/lib/provider";
import { buildProviderSlug } from "@/lib/slug";
import { providerTagOf } from "@/lib/provider-tag";
import { SITE_URL } from "@/lib/site";
import { PAGES_PER_CHUNK, CHUNKS_PER_TYPE } from "@/lib/sitemap-config";
import { locales, defaultLocale, localeToHreflang } from "@/lib/i18n-config";
import type { Movie, TVShow } from "@/lib/types";

export const revalidate = 86400; // 24h, ogni blocco ha cache propria

type Params = { params: Promise<{ type: string; chunk: string }> };

// Un blocco = PAGES_PER_CHUNK pagine di /discover TMDB. Per ogni contenuto si
// emette un <url> (versione di default) con i link hreflang a tutte le lingue.
export async function GET(_req: Request, { params }: Params) {
  const { type, chunk } = await params;
  const chunkNum = parseInt(String(chunk).replace(/\.xml$/, ""), 10);

  if (
    (type !== "film" && type !== "serie") ||
    Number.isNaN(chunkNum) ||
    chunkNum < 0 ||
    chunkNum >= CHUNKS_PER_TYPE
  ) {
    return new Response("Not found", { status: 404 });
  }

  const isMovie = type === "film";
  const startPage = chunkNum * PAGES_PER_CHUNK + 1;
  const pages = Array.from({ length: PAGES_PER_CHUNK }, (_, i) => startPage + i);

  // Lo slug è basato sul titolo (uguale in tutte le lingue: il provider non traduce), quindi
  // basta un fetch solo.
  const provider = await getSelectedProvider();
  const results = await Promise.allSettled(
    pages.map((p) => (isMovie ? discoverMoviesPage(p, provider) : discoverTVPage(p, provider)))
  );

  const seen = new Set<number>();
  const urls: string[] = [];
  const now = new Date().toISOString();

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value.results as (Movie | TVShow)[]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const tag = providerTagOf(item);
      if (!tag) continue;
      const title = "title" in item ? item.title : item.name;
      const slug = buildProviderSlug(tag.provider, tag.realId, title);
      const urlFor = (l: string) => `${SITE_URL}/${l}/${type}/${slug}`;

      const alternates = locales
        .map(
          (l) =>
            `<xhtml:link rel="alternate" hreflang="${localeToHreflang[l]}" href="${urlFor(l)}"/>`
        )
        .join("");

      urls.push(
        `<url><loc>${urlFor(defaultLocale)}</loc>` +
          alternates +
          `<xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(defaultLocale)}"/>` +
          `<lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`
      );
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
