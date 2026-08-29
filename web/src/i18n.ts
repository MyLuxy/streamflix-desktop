import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslation from "./locales/en/translation.json";
import itTranslation from "./locales/it/translation.json";
import frTranslation from "./locales/fr/translation.json";
import esTranslation from "./locales/es/translation.json";
import { locales, defaultLocale, localeToTmdb, type Locale } from "@/lib/i18n-config";

// Lingue mostrate nello switcher delle impostazioni
export const languages = {
  en: { nativeName: "English", flag: "🇬🇧", flagUrl: "/flags/gb.png" },
  it: { nativeName: "Italiano", flag: "🇮🇹", flagUrl: "/flags/it.png" },
  fr: { nativeName: "Français", flag: "🇫🇷", flagUrl: "/flags/fr.png" },
  es: { nativeName: "Español", flag: "🇪🇸", flagUrl: "/flags/es.png" },
};

// Compat: mappa locale -> lingua TMDB (riusata da codice esistente)
export const tmdbLanguages = localeToTmdb;

const resources = {
  en: enTranslation,
  it: itTranslation,
  fr: frTranslation,
  es: esTranslation,
};

// Crea un'istanza i18n inizializzata su una lingua specifica.
// Usare un'istanza per-richiesta evita conflitti di stato durante l'SSR
// concorrente (richieste in lingue diverse nello stesso momento).
export function createI18n(locale: Locale = defaultLocale): I18nInstance {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: locales as unknown as string[],
    debug: false,
    interpolation: { escapeValue: false },
  });
  return instance;
}

// Istanza di default (fallback) per eventuali usi fuori dal provider.
const i18n = createI18n(defaultLocale);
export default i18n;
