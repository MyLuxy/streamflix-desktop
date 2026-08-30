// extra genre rows for specific providers, genreId format varies per provider (numeric ids vs full urls)
export interface CustomSection {
  label: string;
  genreId: string;
}

export const CUSTOM_HOME_SECTIONS: Record<string, CustomSection[]> = {
  StreamingCommunity: [
    { label: "Azione", genreId: "4" },
    { label: "Romance", genreId: "15" },
    { label: "Animazione", genreId: "19" },
    { label: "Sci-Fi & Fantasy", genreId: "3" },
    { label: "Crime", genreId: "2" },
    { label: "Horror", genreId: "7" },
    { label: "Korean Drama", genreId: "26" },
    { label: "Reality", genreId: "18" },
  ],
  "StreamingCommunity (EN)": [
    { label: "Azione", genreId: "4" },
    { label: "Romance", genreId: "15" },
    { label: "Animazione", genreId: "19" },
    { label: "Sci-Fi & Fantasy", genreId: "3" },
    { label: "Crime", genreId: "2" },
    { label: "Horror", genreId: "7" },
    { label: "Korean Drama", genreId: "26" },
    { label: "Reality", genreId: "18" },
  ],
  Altadefinizione01: [
    { label: "Azione", genreId: "https://altadefinizione-01.fun/azione/" },
    { label: "Romance", genreId: "https://altadefinizione-01.fun/romantico/" },
    { label: "Animazione", genreId: "https://altadefinizione-01.fun/animazione/" },
    { label: "Horror", genreId: "https://altadefinizione-01.fun/horror/" },
  ],
  AnimeUnity: [
    { label: "Isekai", genreId: "53" },
    { label: "Shounen", genreId: "34" },
    { label: "Seinen", genreId: "49" },
    { label: "Slice of Life", genreId: "50" },
    { label: "Mecha", genreId: "38" },
    { label: "Romance", genreId: "17" },
    { label: "Sci-Fi", genreId: "40" },
    { label: "Sport", genreId: "27" },
    { label: "Supernatural", genreId: "42" },
    { label: "Horror", genreId: "3" },
  ],
};
