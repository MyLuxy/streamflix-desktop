export const locales = ["en", "it", "fr", "es", "de", "ru"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeToTmdb: Record<Locale, string> = {
  en: "en-US",
  it: "it-IT",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  ru: "ru-RU",
};

export const localeToHreflang: Record<Locale, string> = {
  en: "en",
  it: "it",
  fr: "fr",
  es: "es",
  de: "de",
  ru: "ru",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
