// picked manually (real-world name recognition per country), shown above the full provider grid
// in Settings depending on the active language filter. never IPTV (own catalog, not comparable)
// or anime (has its own dedicated section below)
export const POPULAR_PROVIDERS_BY_LANGUAGE: Record<string, string[]> = {
  all: ["StreamingCommunity (EN)", "TMDB (EN)", "Vuflix", "Ridomovies"],
  it: ["StreamingCommunity", "TMDB (ITA)", "Altadefinizione01", "CB01"],
  en: ["StreamingCommunity (EN)", "TMDB (EN)", "Ridomovies", "Vuflix"],
  es: ["Cuevana 3", "Fanpelis", "PelisflixHD"],
  fr: ["Wiflix", "Kidraz"],
  de: ["HDFilme", "MEGAKino", "Filmo"],
};
