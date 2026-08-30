// flag images not emoji, windows renders flag emoji as literal "IT"/"DE" text
const LANGUAGE_META: Record<string, { label: string; flagUrl: string }> = {
  en: { label: "English", flagUrl: "/flags/gb.svg" },
  it: { label: "Italiano", flagUrl: "/flags/it.svg" },
  fr: { label: "Français", flagUrl: "/flags/fr.svg" },
  es: { label: "Español", flagUrl: "/flags/es.svg" },
  de: { label: "Deutsch", flagUrl: "/flags/de.svg" },
  pl: { label: "Polski", flagUrl: "/flags/pl.svg" },
};

export const languageLabel = (code: string) => LANGUAGE_META[code]?.label ?? code.toUpperCase();
export const languageFlagUrl = (code: string) => LANGUAGE_META[code]?.flagUrl;
