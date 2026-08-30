import { SITE_URL } from "@/lib/site";
import { CHUNKS_PER_TYPE, SITEMAP_TYPES } from "@/lib/sitemap-config";

export const revalidate = 86400; // 24h

export async function GET() {
  const now = new Date().toISOString();
  const sitemaps: string[] = [];

  sitemaps.push(
    `<sitemap><loc>${SITE_URL}/sitemaps/pages.xml</loc><lastmod>${now}</lastmod></sitemap>`
  );

  for (const type of SITEMAP_TYPES) {
    for (let i = 0; i < CHUNKS_PER_TYPE; i++) {
      sitemaps.push(
        `<sitemap><loc>${SITE_URL}/sitemaps/${type}/${i}.xml</loc><lastmod>${now}</lastmod></sitemap>`
      );
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemaps.join("\n") +
    `\n</sitemapindex>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
