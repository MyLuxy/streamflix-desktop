// providers whose catalog is anime-only, shown together in the settings provider list
export const ANIME_PROVIDERS = new Set([
  "Anikoto",
  "AnimeFLV",
  "Animefenix",
  "AnimeBum",
  "AnimeAV1",
  "AniWorld",
  "AnimeWorld",
  "AnimeUnity",
  "AnimeSaturn",
  "AnimeSuge",
  "Anime Online Ninja",
  "HiAnime",
  "JKAnime",
  "TioAnime",
  "FrenchAnime",
  "FrenchManga",
  "Latanime",
  "Otakufr",
]);

// every anime provider tries anilist first, tmdb as the second try when anilist misses
const ANIME_PROVIDERS_USE_ANILIST = new Set(ANIME_PROVIDERS);

export function isAnimeProvider(provider: string | undefined): boolean {
  return !!provider && ANIME_PROVIDERS.has(provider);
}

export function usesAniListArtwork(provider: string | undefined): boolean {
  return !!provider && ANIME_PROVIDERS_USE_ANILIST.has(provider);
}

// hianime's own uploads are full of genuinely missing files - wordpress itself 301s them to
// the homepage (x-redirect-by: WordPress, confirmed even bypassing cloudflare's cache), not
// a bot block, so retrying them is pointless - skip straight to anilist/tmdb every time
const SKIP_OWN_ARTWORK = new Set(["HiAnime"]);

export function skipsOwnArtwork(provider: string | undefined): boolean {
  return !!provider && SKIP_OWN_ARTWORK.has(provider);
}
