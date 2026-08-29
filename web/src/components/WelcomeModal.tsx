"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Languages, Check, Server, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import { languages } from "@/i18n";
import { useProviders } from "@/hooks/useStreamflix";
import { setSelectedProviderClient } from "@/lib/provider";
import { proxyImage, PROVIDER_LOGO_FALLBACK } from "@/lib/constants";
import { languageFlagUrl } from "@/lib/content-languages";
import { LanguageFilterDropdown } from "@/components/LanguageFilterDropdown";

const WELCOME_STORAGE_KEY = "streamflix_welcome_accepted";

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"language" | "provider">("language");
  const [pendingLang, setPendingLang] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<string | null>(null); // null = tutte le lingue
  const [providerIndex, setProviderIndex] = useState(0);
  const { i18n } = useTranslation();
  const pathname = usePathname();
  const { data: providers, isLoading: loadingProviders } = useProviders();

  useEffect(() => {
    const hasAccepted = localStorage.getItem(WELCOME_STORAGE_KEY);
    if (!hasAccepted) {
      setIsOpen(true);
    }
  }, []);

  // Blocca lo scroll del sito mentre il modale è aperto
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const availableLanguages = useMemo(
    () => Array.from(new Set((providers ?? []).map((p) => p.language))).sort(),
    [providers]
  );

  const filteredProviders = useMemo(
    () => (providers ?? []).filter((p) => !langFilter || p.language === langFilter),
    [providers, langFilter]
  );

  // Il filtro riparte da 0 ogni volta che cambia (lista diversa = indici diversi)
  useEffect(() => {
    setProviderIndex(0);
  }, [langFilter]);

  const handleLanguageSelect = (lng: string) => {
    i18n.changeLanguage(lng);
    setPendingLang(lng);
    setLangFilter(lng);
    setStep("provider");
  };

  const finish = (providerName?: string) => {
    if (providerName) setSelectedProviderClient(providerName);
    localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    setIsOpen(false);

    const lng = pendingLang;
    if (lng) {
      document.cookie = `NEXT_LOCALE=${lng};path=/;max-age=31536000;samesite=lax`;
      const parts = pathname.split("/");
      parts[1] = lng;
      setTimeout(() => {
        window.location.assign(parts.join("/") || "/");
      }, 300);
    }
  };

  if (!isOpen) return null;

  const providerCount = filteredProviders.length;
  const currentProvider = providerCount > 0 ? filteredProviders[providerIndex % providerCount] : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-3xl my-8 bg-card rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Step 1: Language Selection */}
          {step === "language" && (
            <div className="p-6 md:p-8 lg:p-10">
              <div className="flex items-start gap-4 mb-6 md:mb-8">
                <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Languages className="w-6 h-6 md:w-7 md:h-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                    Choose Your Language
                  </h2>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Select your preferred language for the interface
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 md:mb-6">
                {Object.entries(languages).map(([code, { nativeName, flagUrl }]) => (
                  <button
                    key={code}
                    onClick={() => handleLanguageSelect(code)}
                    className="flex items-center gap-4 p-4 md:p-5 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all duration-200 group"
                  >
                    <img src={flagUrl} alt="" className="w-10 h-7 md:w-12 md:h-8 object-cover flex-shrink-0" />
                    <p className="font-semibold text-base md:text-lg text-foreground group-hover:text-primary transition-colors flex-1 text-left">
                      {nativeName}
                    </p>
                    <Check className="w-5 h-5 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Provider Selection - carousel, filterable by content language */}
          {step === "provider" && (
            <div className="p-6 md:p-8 lg:p-10">
              <div className="flex items-start justify-between gap-3 mb-6 md:mb-8">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Server className="w-6 h-6 md:w-7 md:h-7 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                      Choose a Provider
                    </h2>
                    <p className="text-sm md:text-base text-muted-foreground">
                      Select which source to use. You can change this later in Settings.
                    </p>
                  </div>
                </div>

                {/* Filtro lingua contenuti - in alto a destra */}
                <LanguageFilterDropdown
                  value={langFilter}
                  onChange={setLangFilter}
                  availableLanguages={availableLanguages}
                />
              </div>

              {loadingProviders ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
              ) : currentProvider ? (
                <div className="flex items-center justify-center gap-4 md:gap-8 mb-6 md:mb-8">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full h-11 w-11 md:h-14 md:w-14 flex-shrink-0"
                    onClick={() => setProviderIndex((i) => (i - 1 + providerCount) % providerCount)}
                    aria-label="Previous provider"
                  >
                    <ChevronLeft className="w-6 h-6 md:w-7 md:h-7" />
                  </Button>

                  <div className="flex flex-col items-center gap-3 border-2 border-border rounded-xl p-6 md:p-8 w-full max-w-sm">
                    <img
                      // keyed by provider name so switching providers always mounts a fresh <img> -
                      // without this React reuses the same DOM node and only swaps `src`, so the
                      // onError handler's direct src mutation to the fallback would stick around
                      // even after navigating to a different, perfectly working logo
                      key={currentProvider.name}
                      src={proxyImage(currentProvider.logo)}
                      alt=""
                      className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover bg-muted"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src.endsWith(PROVIDER_LOGO_FALLBACK)) return;
                        img.src = PROVIDER_LOGO_FALLBACK;
                      }}
                    />
                    <p className="font-semibold text-lg md:text-xl text-foreground text-center">
                      {currentProvider.name}
                    </p>
                    <p className="text-xs md:text-sm text-muted-foreground flex items-center gap-1.5">
                      {languageFlagUrl(currentProvider.language) ? (
                        <img src={languageFlagUrl(currentProvider.language)} alt="" className="w-4 h-3 object-cover" />
                      ) : (
                        <Globe className="w-3.5 h-3.5" />
                      )}
                      <span>{providerIndex % providerCount + 1} / {providerCount}</span>
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full h-11 w-11 md:h-14 md:w-14 flex-shrink-0"
                    onClick={() => setProviderIndex((i) => (i + 1) % providerCount)}
                    aria-label="Next provider"
                  >
                    <ChevronRight className="w-6 h-6 md:w-7 md:h-7" />
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">
                    No providers for this language.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setLangFilter(null)}>
                    Show all languages
                  </Button>
                </div>
              )}

              <Button
                onClick={() => finish(currentProvider?.name)}
                disabled={!currentProvider}
                className="w-full h-12 md:h-14 text-base md:text-lg font-semibold"
              >
                Continue
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
