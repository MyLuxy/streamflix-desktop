import { useState, useEffect, useCallback } from "react";
import { SubtitlePreferences } from "@/lib/types";

const STORAGE_KEY = "streamify-subtitle-preferences";

export interface SubtitleTrack {
  language: string;
  languageCode: string;
  label: string;
}

// Supported subtitle languages
export const SUBTITLE_LANGUAGES: SubtitleTrack[] = [
  { language: "English", languageCode: "en", label: "English" },
  { language: "Italian", languageCode: "it", label: "Italiano" },
  { language: "Spanish", languageCode: "es", label: "Español" },
  { language: "French", languageCode: "fr", label: "Français" },
  { language: "German", languageCode: "de", label: "Deutsch" },
  { language: "Portuguese", languageCode: "pt", label: "Português" },
];

export function useSubtitles() {
  const [preferences, setPreferences] = useState<SubtitlePreferences>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return { enabled: false, preferredLanguage: "en" };
        }
      }
    }
    return { enabled: false, preferredLanguage: "en" };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const toggleSubtitles = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  }, []);

  const setLanguage = useCallback((languageCode: string) => {
    setPreferences((prev) => ({
      ...prev,
      preferredLanguage: languageCode,
      enabled: true,
    }));
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setPreferences((prev) => ({
      ...prev,
      enabled,
    }));
  }, []);

  return {
    preferences,
    toggleSubtitles,
    setLanguage,
    setEnabled,
    availableLanguages: SUBTITLE_LANGUAGES,
  };
}
