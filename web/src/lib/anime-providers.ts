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

// of those, the ones whose titles anilist actually catalogs well enough to bother
// hitting it before tmdb - HiAnime's own titles match tmdb fine, anilist just adds a
// slower, less reliable extra hop for it
const ANIME_PROVIDERS_USE_ANILIST = new Set(ANIME_PROVIDERS);
ANIME_PROVIDERS_USE_ANILIST.delete("HiAnime");

export function isAnimeProvider(provider: string | undefined): boolean {
  return !!provider && ANIME_PROVIDERS.has(provider);
}

export function usesAniListArtwork(provider: string | undefined): boolean {
  return !!provider && ANIME_PROVIDERS_USE_ANILIST.has(provider);
}
