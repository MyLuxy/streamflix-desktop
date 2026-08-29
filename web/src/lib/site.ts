// Configurazione globale del sito (SEO / metadati).
// SITE_URL va impostato in produzione via env NEXT_PUBLIC_SITE_URL (es. https://tuodominio.to)
export const SITE_NAME = "StreamFlix";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:8080";

export const SITE_DESCRIPTION =
  "Watch movies and TV shows in HD on StreamFlix. Thousands of titles, anime, subtitles. No registration required.";
