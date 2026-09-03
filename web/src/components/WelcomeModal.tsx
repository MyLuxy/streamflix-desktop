"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, ArrowRight, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import { languages } from "@/i18n";
import { useProviders } from "@/hooks/useStreamflix";
import { setSelectedProviderClient } from "@/lib/provider";
import { proxyImage, PROVIDER_LOGO_FALLBACK } from "@/lib/constants";
import { LanguageFilterDropdown } from "@/components/LanguageFilterDropdown";
import { BACKEND_URL } from "@/lib/backend";
import { setCustomTmdbKeyClient } from "@/lib/tmdb-key";

const WELCOME_STORAGE_KEY = "streamflix_welcome_accepted";

type Step = "welcome" | "language" | "tmdb" | "provider";
const STEPS: Step[] = ["welcome", "language", "tmdb", "provider"];

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const [pendingLang, setPendingLang] = useState<string | null>(null);
  const [selectedUiLang, setSelectedUiLang] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<string | null>(null); // null = all languages
  const [selectedProviderName, setSelectedProviderName] = useState<string | null>(null);
  const [tmdbKeyInput, setTmdbKeyInput] = useState("");
  const [tmdbKeyError, setTmdbKeyError] = useState<string | null>(null);
  // idle = nothing typed, only "valid" lets Continue actually mean continue
  const [tmdbKeyStatus, setTmdbKeyStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  // disables the button after click so a double click cant fire two navigations
  const [isFinishing, setIsFinishing] = useState(false);
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const { data: providers, isLoading: loadingProviders } = useProviders();

  const providerScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollProviderLeft, setCanScrollProviderLeft] = useState(false);
  const [canScrollProviderRight, setCanScrollProviderRight] = useState(true);

  const checkProviderScroll = () => {
    const el = providerScrollRef.current;
    if (!el) return;
    setCanScrollProviderLeft(el.scrollLeft > 4);
    setCanScrollProviderRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  const scrollProviders = (direction: "left" | "right") => {
    const el = providerScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -el.clientWidth * 0.8 : el.clientWidth * 0.8, behavior: "smooth" });
  };

  useEffect(() => {
    const hasAccepted = localStorage.getItem(WELCOME_STORAGE_KEY);
    if (!hasAccepted) {
      setIsOpen(true);
    }
  }, []);

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

  // keeps the pick if it's still in the (possibly re-filtered) list, otherwise falls back to the first one
  useEffect(() => {
    // direct scrollLeft assignment jumps instantly, scrollTo() would animate because of the
    // container's scroll-smooth class and leave the left arrow visible until it catches up
    if (providerScrollRef.current) providerScrollRef.current.scrollLeft = 0;
    setSelectedProviderName((prev) =>
      prev && filteredProviders.some((p) => p.name === prev) ? prev : filteredProviders[0]?.name ?? null
    );
    checkProviderScroll();
  }, [filteredProviders]);

  const handleLanguageSelect = (lng: string) => {
    i18n.changeLanguage(lng);
    setPendingLang(lng);
    setLangFilter(lng);
    setStep("tmdb");
  };

  // checks the key against tmdb itself as the user types (debounced), instead of waiting for
  // them to hit continue - that's also the point where a valid key actually gets saved, so by
  // the time continue says "Continue" instead of "Skip" there's nothing left to do but advance
  useEffect(() => {
    const key = tmdbKeyInput.trim();
    if (!key) {
      setTmdbKeyStatus("idle");
      setTmdbKeyError(null);
      return;
    }
    setTmdbKeyStatus("checking");
    setTmdbKeyError(null);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/settings/tmdb-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: key }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setTmdbKeyStatus("invalid");
          setTmdbKeyError(t("setup.tmdb.invalidKey"));
          return;
        }
        setCustomTmdbKeyClient(key);
        setTmdbKeyStatus("valid");
        setTmdbKeyError(null);
      } catch {
        setTmdbKeyStatus("invalid");
        setTmdbKeyError(t("setup.tmdb.networkError"));
      }
    }, 600);
    return () => clearTimeout(timer);
    // only the typed key should retrigger this, not every t() reference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKeyInput]);

  const finish = (providerName?: string) => {
    if (isFinishing) return;
    setIsFinishing(true);
    if (providerName) setSelectedProviderClient(providerName);
    localStorage.setItem(WELCOME_STORAGE_KEY, "true");

    const lng = pendingLang;
    if (lng) {
      document.cookie = `NEXT_LOCALE=${lng};path=/;max-age=31536000;samesite=lax`;
      const parts = pathname.split("/");
      parts[1] = lng;
      setTimeout(() => {
        window.location.assign(parts.join("/") || "/");
      }, 300);
    } else {
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  const selectedProvider = filteredProviders.find((p) => p.name === selectedProviderName) ?? null;
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-hidden">
      <motion.img
        aria-hidden
        src="/setup-bg.webp"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onLoad={() => setBgLoaded(true)}
        initial={{ opacity: 0 }}
        animate={{ opacity: bgLoaded ? 1 : 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/55"
        initial={{ opacity: 0 }}
        animate={{ opacity: bgLoaded ? 1 : 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      <motion.div
        className="relative h-full flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
      >
        <div className="h-20 md:h-24 flex items-center px-6 md:px-10 flex-shrink-0">
          {stepIndex > 0 && (
            <button
              onClick={() => setStep(STEPS[stepIndex - 1])}
              className="flex items-center gap-2 text-xl md:text-2xl font-semibold text-foreground hover:opacity-70 transition-opacity drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]"
            >
              <ChevronLeft className="w-7 h-7 md:w-8 md:h-8" />
              {t("content.goBack", { lng: selectedUiLang ?? undefined })}
            </button>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-8 md:pb-14 overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="w-full max-w-3xl flex flex-col items-center text-center py-8"
              >
                <img src="/logo-mark.png" alt="StreamFlix" className="h-24 sm:h-28 md:h-32 w-auto object-contain mb-5 md:mb-6 drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]" />
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground mb-4 sm:whitespace-nowrap drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                  Welcome to StreamFlix
                </h1>
                <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 md:mb-10 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
                  StreamFlix brings movies, shows and anime from free sources into one simple app.
                </p>
                <Button
                  onClick={() => setStep("language")}
                  className="w-full max-w-sm h-16 text-lg font-semibold gap-2 group"
                >
                  Continue
                  <ArrowRight className="w-7 h-7 transition-transform duration-200 group-hover:translate-x-1.5" />
                </Button>
              </motion.div>
            )}

            {step === "language" && (
              <motion.div
                key="language"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="w-full max-w-3xl py-8 flex flex-col items-center"
              >
                <div className="text-center mb-10 md:mb-12">
                  <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground mb-6 sm:whitespace-nowrap drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                    Choose your language
                  </h2>
                  <p className="text-lg md:text-xl text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
                    Select your preferred language for the interface
                  </p>
                </div>

                <div className="w-full max-w-xl grid grid-cols-2 gap-4 md:gap-5 mb-10">
                  {Object.entries(languages).map(([code, { nativeName, flagUrl }], i, entries) => {
                    const isLastOdd = entries.length % 2 === 1 && i === entries.length - 1;
                    const selected = selectedUiLang === code;
                    return (
                    <button
                      key={code}
                      onClick={() => setSelectedUiLang(code)}
                      className={`flex items-center gap-4 p-5 md:p-6 rounded-xl border-2 backdrop-blur-sm transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        selected
                          ? "border-white bg-white/10"
                          : "border-border bg-background/40 hover:border-foreground/40 hover:bg-secondary/50"
                      } ${isLastOdd ? "col-span-2 w-[calc(50%-0.5rem)] md:w-[calc(50%-0.625rem)] mx-auto" : ""}`}
                    >
                      <img src={flagUrl} alt="" className="w-10 h-7 md:w-11 md:h-8 object-cover flex-shrink-0 rounded-sm" />
                      <span className="font-medium text-base md:text-lg text-foreground flex-1 text-left drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                        {nativeName}
                      </span>
                      <Check className={`w-7 h-7 text-white transition-opacity flex-shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} />
                    </button>
                    );
                  })}
                </div>

                <Button
                  onClick={() => selectedUiLang && handleLanguageSelect(selectedUiLang)}
                  disabled={!selectedUiLang}
                  className="w-full max-w-sm h-16 text-lg font-semibold gap-2 group"
                >
                  {t("setup.continue", { lng: selectedUiLang ?? undefined })}
                  <ArrowRight className="w-7 h-7 transition-transform duration-200 group-hover:translate-x-1.5" />
                </Button>
              </motion.div>
            )}

            {step === "tmdb" && (
              <motion.div
                key="tmdb"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="w-full max-w-3xl flex flex-col items-center text-center py-8"
              >
                <div className="flex items-center justify-center gap-5 md:gap-6 mb-6">
                  <img src={PROVIDER_LOGO_FALLBACK} alt="" className="h-16 sm:h-20 md:h-24 w-auto object-contain opacity-90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]" />
                  <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground sm:whitespace-nowrap drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                    {t("setup.tmdb.title")}
                  </h2>
                </div>
                <p className="max-w-xl text-lg md:text-xl text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] mb-8">
                  {t("setup.tmdb.description")}
                </p>

                <div className="w-full max-w-md">
                  <div className="relative">
                    <input
                      type="password"
                      value={tmdbKeyInput}
                      onChange={(e) => setTmdbKeyInput(e.target.value)}
                      placeholder={t("setup.tmdb.placeholder")}
                      className={`w-full h-14 pl-5 pr-12 rounded-xl border-2 bg-background/40 backdrop-blur-sm text-foreground placeholder:text-muted-foreground text-base outline-none transition-colors ${
                        tmdbKeyStatus === "invalid"
                          ? "border-red-400"
                          : "border-border focus-visible:border-white"
                      }`}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      {tmdbKeyStatus === "checking" && <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />}
                      {tmdbKeyStatus === "valid" && <Check className="w-5 h-5 text-emerald-400" />}
                    </div>
                  </div>
                  <a
                    href="https://www.themoviedb.org/settings/api"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
                  >
                    {t("setup.tmdb.getKeyLink")}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {tmdbKeyError && (
                    <p className="mt-3 text-sm text-red-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">{tmdbKeyError}</p>
                  )}
                </div>

                <Button
                  onClick={() => setStep("provider")}
                  variant={tmdbKeyStatus === "valid" ? "default" : "secondary"}
                  className="w-full max-w-sm h-16 text-lg font-semibold gap-2 group mt-10"
                >
                  {tmdbKeyStatus === "valid" ? t("setup.continue") : t("setup.tmdb.skip")}
                  <ArrowRight className="w-7 h-7 transition-transform duration-200 group-hover:translate-x-1.5" />
                </Button>
              </motion.div>
            )}

            {step === "provider" && (
              <motion.div
                key="provider"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="w-full max-w-4xl flex flex-col items-center py-8"
              >
                <div className="text-center mb-7 w-full">
                  <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground mb-6 sm:whitespace-nowrap drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                    {t("setup.provider.title")}
                  </h2>
                  <p className="text-lg md:text-xl text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
                    {t("setup.provider.description")}
                  </p>
                </div>

                <LanguageFilterDropdown
                  value={langFilter}
                  onChange={setLangFilter}
                  availableLanguages={availableLanguages}
                  className="mb-10"
                  buttonClassName="pl-4 pr-5 py-4 text-base gap-3"
                  chevronClassName="w-4 h-4"
                  align="left"
                />

                {loadingProviders ? (
                  <p className="text-base text-muted-foreground text-center py-8 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">{t("settings.loadingProviders")}</p>
                ) : filteredProviders.length > 0 ? (
                  <div className="relative w-full mb-12">
                    <button
                      onClick={() => scrollProviders("left")}
                      disabled={isFinishing || !canScrollProviderLeft}
                      aria-label="Scroll left"
                      className={`absolute -left-16 md:-left-24 top-0 bottom-0 z-10 flex items-center transition-opacity duration-200 ${
                        canScrollProviderLeft ? "opacity-100" : "opacity-0 pointer-events-none"
                      }`}
                    >
                      <ChevronLeft className="w-14 h-14 md:w-16 md:h-16 text-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" />
                    </button>

                    <div
                      ref={providerScrollRef}
                      onScroll={checkProviderScroll}
                      className="flex gap-4 md:gap-5 overflow-x-auto scrollbar-hide scroll-smooth px-2 py-1"
                    >
                      {filteredProviders.map((p) => {
                        const selected = p.name === selectedProviderName;
                        return (
                          <button
                            key={p.name}
                            onClick={() => setSelectedProviderName(p.name)}
                            disabled={isFinishing}
                            className={`flex flex-col items-center gap-3 flex-shrink-0 w-36 sm:w-44 md:w-52 rounded-xl border-2 p-5 md:p-6 backdrop-blur-sm transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                              selected
                                ? "border-white bg-white/10"
                                : "border-border bg-background/40 hover:border-foreground/40 hover:bg-secondary/50"
                            }`}
                          >
                            <div className="relative">
                              <img
                                // fresh img per provider name, otherwise a stale onError fallback src sticks around
                                key={p.name}
                                src={proxyImage(p.logo)}
                                alt=""
                                className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover bg-muted"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  if (img.src.endsWith(PROVIDER_LOGO_FALLBACK)) return;
                                  img.src = PROVIDER_LOGO_FALLBACK;
                                }}
                              />
                              {selected && (
                                <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                                  <Check className="w-4 h-4 text-black" />
                                </span>
                              )}
                            </div>
                            <p className="font-semibold text-base md:text-lg text-foreground text-center line-clamp-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                              {p.name}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => scrollProviders("right")}
                      disabled={isFinishing || !canScrollProviderRight}
                      aria-label="Scroll right"
                      className={`absolute -right-16 md:-right-24 top-0 bottom-0 z-10 flex items-center transition-opacity duration-200 ${
                        canScrollProviderRight ? "opacity-100" : "opacity-0 pointer-events-none"
                      }`}
                    >
                      <ChevronRight className="w-14 h-14 md:w-16 md:h-16 text-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" />
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 mb-2">
                    <p className="text-base text-muted-foreground mb-4 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
                      {t("setup.provider.noProviders")}
                    </p>
                    <Button variant="outline" onClick={() => setLangFilter(null)}>
                      {t("setup.provider.showAllLanguages")}
                    </Button>
                  </div>
                )}

                <Button
                  onClick={() => finish(selectedProvider?.name)}
                  disabled={!selectedProvider || isFinishing}
                  className="w-full max-w-sm h-16 text-lg font-semibold gap-2 group"
                >
                  {isFinishing && <Loader2 className="w-5 h-5 animate-spin" />}
                  {t("setup.continue")}
                  <ArrowRight className="w-7 h-7 transition-transform duration-200 group-hover:translate-x-1.5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* progress: this really is a 3-step sequence, so dots earn their place here */}
        <div className="flex items-center justify-center gap-2.5 pb-10 md:pb-12 flex-shrink-0">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === stepIndex ? "w-8 bg-foreground" : "w-2 bg-foreground/20"
              }`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
