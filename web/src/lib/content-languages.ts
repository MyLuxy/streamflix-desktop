// decorative label/flag for a provider's content language - falls back gracefully to the bare
// code for anything not in this list, so a provider in a language nobody's added yet still works.
// flag images (not emoji) on purpose: Windows has no glyphs for regional-indicator emoji, so a
// flag emoji renders there as literal "IT"/"DE" text instead of a flag
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
