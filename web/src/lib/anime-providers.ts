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

// hianime's own uploads are full of genuinely missing files, wordpress just 301s them home, skip straight to anilist/tmdb
const SKIP_OWN_ARTWORK = new Set(["HiAnime"]);

export function skipsOwnArtwork(provider: string | undefined): boolean {
  return !!provider && SKIP_OWN_ARTWORK.has(provider);
}
