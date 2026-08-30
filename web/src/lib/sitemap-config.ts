// split into chunks so we dont generate 20k urls at once, stays under googles 50k/file limit
export const TMDB_MAX_PAGES = 500;
export const PAGES_PER_CHUNK = 20;
export const CHUNKS_PER_TYPE = Math.ceil(TMDB_MAX_PAGES / PAGES_PER_CHUNK);

export type SitemapType = "film" | "serie";

export const SITEMAP_TYPES: SitemapType[] = ["film", "serie"];
