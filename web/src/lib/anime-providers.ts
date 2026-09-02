// providers whose catalog is anime-only, artwork fallback should hit anilist not tmdb
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

export function isAnimeProvider(provider: string | undefined): boolean {
  return !!provider && ANIME_PROVIDERS.has(provider);
}
