// Configurazione delle lingue / locale del sito.
export const locales = ["en", "it", "fr", "es"] as const;
export type Locale = (typeof locales)[number];

// Lingua di default (inglese, come richiesto).
export const defaultLocale: Locale = "en";

// Mappa locale -> lingua TMDB (parametro `language` dell'API).
export const localeToTmdb: Record<Locale, string> = {
  en: "en-US",
  it: "it-IT",
  fr: "fr-FR",
  es: "es-ES",
};

// Mappa locale -> valore hreflang.
export const localeToHreflang: Record<Locale, string> = {
  en: "en",
  it: "it",
  fr: "fr",
  es: "es",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
