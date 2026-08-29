// Configurazione della sitemap a catalogo.
// TMDB espone fino a 500 pagine di /discover (20 risultati per pagina).
// Suddividiamo il catalogo in "blocchi" da PAGES_PER_CHUNK pagine: ogni blocco
// è una sitemap indipendente (cache separata), così non si generano 20k URL
// in un colpo solo e si resta entro i limiti di Google (50k URL/file).

export const TMDB_MAX_PAGES = 500;
export const PAGES_PER_CHUNK = 20; // 20 pagine * 20 = 400 URL per blocco
export const CHUNKS_PER_TYPE = Math.ceil(TMDB_MAX_PAGES / PAGES_PER_CHUNK); // 25

export type SitemapType = "film" | "serie";

export const SITEMAP_TYPES: SitemapType[] = ["film", "serie"];
