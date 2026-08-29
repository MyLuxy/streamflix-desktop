import { SITE_URL } from "@/lib/site";
import { locales, defaultLocale, localeToHreflang } from "@/lib/i18n-config";

export const revalidate = 86400;

// Sitemap delle pagine statiche indicizzabili (home, una per lingua + hreflang).
export async function GET() {
  const now = new Date().toISOString();
  const urlFor = (l: string) => `${SITE_URL}/${l}`;

  const alternates =
    locales
      .map(
        (l) =>
          `<xhtml:link rel="alternate" hreflang="${localeToHreflang[l]}" href="${urlFor(l)}"/>`
      )
      .join("") +
    `<xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(defaultLocale)}"/>`;

  const urls = locales.map(
    (l) =>
      `<url><loc>${urlFor(l)}</loc>${alternates}<lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  );

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
