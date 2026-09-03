import { Languages, Server, Check, Search, Loader2, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { languages } from "@/i18n";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/hooks/useLocale";
import { useProviders, type StreamflixProvider } from "@/hooks/useStreamflix";
import {
  getSelectedProviderClient,
  setSelectedProviderClient,
  getSavedProviderLangFilter,
  setSavedProviderLangFilter,
} from "@/lib/provider";
import { proxyImage, PROVIDER_LOGO_FALLBACK } from "@/lib/constants";
import { LanguageFilterDropdown } from "@/components/LanguageFilterDropdown";
import { POPULAR_PROVIDERS_BY_LANGUAGE } from "@/lib/popular-providers";
import { isAnimeProvider } from "@/lib/anime-providers";
import { BACKEND_URL } from "@/lib/backend";
import { setCustomTmdbKeyClient } from "@/lib/tmdb-key";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SettingsPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = useLocale();
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");
  // null on first render to avoid a hydration mismatch, real value applied in the effect below
  const [providerLangFilter, setProviderLangFilterState] = useState<string | null>(null);
  // buttons stay disabled while pending so switching fast doesnt queue up scrape requests
  const [isPending, startTransition] = useTransition();
  const [tmdbKeyInput, setTmdbKeyInput] = useState("");
  const [tmdbKeyError, setTmdbKeyError] = useState<string | null>(null);
  const [tmdbKeyStatus, setTmdbKeyStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  // whether a personal key is saved server-side right now, the input itself never gets
  // pre-filled with it - a stored secret shouldnt reappear in plaintext just from loading the page
  const [hasStoredTmdbKey, setHasStoredTmdbKey] = useState(false);

  useEffect(() => {
    setSelectedProvider(getSelectedProviderClient());
    setProviderLangFilterState(getSavedProviderLangFilter());

    fetch(`${BACKEND_URL}/api/settings/tmdb-key`)
      .then((res) => res.json())
      .then((data) => {
        if (data.hasCustomKey) setHasStoredTmdbKey(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const key = tmdbKeyInput.trim();
    if (!key) {
      // nothing typed, just reflect whatever's already stored - typing then erasing shouldnt
      // silently delete a saved key, removing it is its own explicit action below
      setTmdbKeyStatus(hasStoredTmdbKey ? "valid" : "idle");
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
        setHasStoredTmdbKey(true);
        setTmdbKeyStatus("valid");
      } catch {
        setTmdbKeyStatus("invalid");
        setTmdbKeyError(t("setup.tmdb.networkError"));
      }
    }, 600);
    return () => clearTimeout(timer);
    // only the typed key should retrigger this, not every t() reference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKeyInput, hasStoredTmdbKey]);

  const removeStoredTmdbKey = () => {
    setCustomTmdbKeyClient(null);
    setHasStoredTmdbKey(false);
    setTmdbKeyInput("");
    setTmdbKeyStatus("idle");
    fetch(`${BACKEND_URL}/api/settings/tmdb-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: null }),
    }).catch(() => {});
  };

  const setProviderLangFilter = (code: string | null) => {
    setProviderLangFilterState(code);
    setSavedProviderLangFilter(code);
  };

  const changeProvider = (name: string) => {
    if (name === selectedProvider || isPending) return;
    setSelectedProviderClient(name);
    setSelectedProvider(name);
    startTransition(() => {
      router.refresh();
    });
  };

  const changeLanguage = (lng: string) => {
    if (lng === currentLocale) return;
    document.cookie = `NEXT_LOCALE=${lng};path=/;max-age=31536000;samesite=lax`;
    const parts = pathname.split("/");
    parts[1] = lng;
    window.location.assign(parts.join("/") || "/");
  };

  const availableProviderLanguages = useMemo(
    () => Array.from(new Set((providers ?? []).map((p) => p.language))).sort(),
    [providers]
  );

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    return (providers ?? []).filter((p) => {
      if (providerLangFilter && p.language !== providerLangFilter) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [providers, providerSearch, providerLangFilter]);

  // also filtered by search, otherwise it looks like search only works on the "all" section
  const popularProviders = useMemo(() => {
    const names = POPULAR_PROVIDERS_BY_LANGUAGE[providerLangFilter ?? "all"];
    if (!names) return [];
    const q = providerSearch.trim().toLowerCase();
    return names
      .map((name) => providers?.find((p) => p.name === name))
      .filter((p): p is StreamflixProvider => !!p && (!q || p.name.toLowerCase().includes(q)));
  }, [providers, providerLangFilter, providerSearch]);

  const animeProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    return (providers ?? []).filter(
      (p) =>
        isAnimeProvider(p.name) &&
        (!providerLangFilter || p.language === providerLangFilter) &&
        (!q || p.name.toLowerCase().includes(q))
    );
  }, [providers, providerLangFilter, providerSearch]);

  return (
    <div className="max-w-6xl mx-auto px-1 md:px-0 -mt-6 md:mt-0">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-8 md:mb-12">
          {t('settings.title')}
        </h1>

        <section className="bg-card rounded-2xl p-5 md:p-8 mb-6 md:mb-8">
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <Languages className="w-6 h-6 md:w-7 md:h-7 text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-lg md:text-xl text-foreground">{t('settings.language')}</p>
              <p className="text-sm md:text-base text-muted-foreground">
                {t('settings.languageDesc')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {Object.entries(languages).map(([code, { nativeName, flagUrl }]) => (
              <Button
                key={code}
                variant={currentLocale === code ? "default" : "outline"}
                onClick={() => changeLanguage(code)}
                className="h-14 md:h-16 gap-2.5 text-base md:text-lg justify-start px-4 md:px-5"
              >
                <img src={flagUrl} alt={code} className="w-7 h-5 md:w-8 md:h-6 rounded-sm object-cover flex-shrink-0" />
                {nativeName}
              </Button>
            ))}
          </div>
        </section>

        <section className="bg-card rounded-2xl p-5 md:p-8 mb-6 md:mb-8">
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <img src={PROVIDER_LOGO_FALLBACK} alt="" className="w-12 h-12 md:w-16 md:h-16 rounded flex-shrink-0" />
            <div>
              <p className="font-semibold text-lg md:text-xl text-foreground">{t('setup.tmdb.title')}</p>
              <p className="text-sm md:text-base text-muted-foreground">
                {t('setup.tmdb.description')}
              </p>
            </div>
          </div>

          <div className="max-w-lg">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="password"
                  value={tmdbKeyInput}
                  onChange={(e) => setTmdbKeyInput(e.target.value)}
                  placeholder={hasStoredTmdbKey ? t('setup.tmdb.customActive') : t('setup.tmdb.placeholder')}
                  className={`w-full h-12 pl-4 pr-11 rounded-md border-2 bg-card text-foreground placeholder:text-muted-foreground text-sm outline-none transition-colors ${
                    tmdbKeyStatus === "invalid"
                      ? "border-red-400"
                      : "border-border focus:border-primary"
                  }`}
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {tmdbKeyStatus === "checking" && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                  {tmdbKeyStatus === "valid" && <Check className="w-4 h-4 text-emerald-400" />}
                </div>
              </div>
              {hasStoredTmdbKey && !tmdbKeyInput && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="h-12 px-4 flex-shrink-0 rounded-md border-2 border-border text-sm text-muted-foreground hover:border-red-400 hover:text-red-400 transition-colors"
                    >
                      {t('setup.tmdb.remove')}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="max-w-sm rounded-2xl bg-card border-border p-6">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">
                        {t('setup.tmdb.removeConfirmTitle')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('setup.tmdb.removeConfirmDesc')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('content.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={removeStoredTmdbKey}
                        className="bg-red-500 text-white hover:bg-red-500/90"
                      >
                        {t('setup.tmdb.remove')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <a
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('setup.tmdb.getKeyLink')}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {tmdbKeyError && <p className="mt-2 text-sm text-red-400">{tmdbKeyError}</p>}
          </div>
        </section>

        <section className="bg-card rounded-2xl p-5 md:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 md:mb-6">
            <div className="flex items-center gap-3">
              <Server className="w-9 h-9 md:w-11 md:h-11 text-primary flex-shrink-0" />
              <div>
                <p className="font-semibold text-lg md:text-xl text-foreground">{t('settings.contentSource')}</p>
                <p className="text-sm md:text-base text-muted-foreground">
                  {t('settings.contentSourceDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative flex-1 lg:flex-initial">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder={t('settings.searchProvider')}
                  className="h-11 w-full lg:w-56 pl-9 pr-3 text-sm border-2 border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors rounded-md"
                />
              </div>
              <LanguageFilterDropdown
                value={providerLangFilter}
                onChange={setProviderLangFilter}
                availableLanguages={availableProviderLanguages}
              />
            </div>
          </div>

          {loadingProviders ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('settings.loadingProviders')}</p>
          ) : filteredProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('settings.noProvidersFound')}</p>
          ) : (
            <div className="relative">
              <div
                className={`space-y-6 md:space-y-8 transition-opacity ${isPending ? "opacity-50 pointer-events-none" : ""}`}
              >
                {popularProviders.length > 0 && (
                  <div>
                    <p className="text-xl md:text-2xl font-bold text-foreground mb-3">{t('settings.popularProviders')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                      {popularProviders.map((p) => (
                        <ProviderTile
                          key={p.name}
                          provider={p}
                          isSelected={selectedProvider === p.name}
                          disabled={isPending}
                          onClick={() => changeProvider(p.name)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {animeProviders.length > 0 && (
                  <div>
                    <p className="text-xl md:text-2xl font-bold text-foreground mb-3">{t('settings.animeProviders')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                      {animeProviders.map((p) => (
                        <ProviderTile
                          key={p.name}
                          provider={p}
                          isSelected={selectedProvider === p.name}
                          disabled={isPending}
                          onClick={() => changeProvider(p.name)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xl md:text-2xl font-bold text-foreground mb-3">{t('settings.allProviders')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                    {filteredProviders.map((p) => (
                      <ProviderTile
                        key={p.name}
                        provider={p}
                        isSelected={selectedProvider === p.name}
                        disabled={isPending}
                        onClick={() => changeProvider(p.name)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {isPending && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('settings.switchingProvider')}
                </div>
              )}
            </div>
          )}
        </section>
      </motion.div>
    </div>
  );
}

function ProviderTile({
  provider,
  isSelected,
  disabled,
  onClick,
}: {
  provider: StreamflixProvider;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2.5 rounded-xl border-2 px-3 py-4 text-center transition-colors ${
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-secondary/60"
      }`}
    >
      <div className="relative">
        <img
          src={proxyImage(provider.logo)}
          alt=""
          className="w-12 h-12 md:w-14 md:h-14 rounded-lg object-cover bg-muted"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (img.src.endsWith(PROVIDER_LOGO_FALLBACK)) return;
            img.src = PROVIDER_LOGO_FALLBACK;
          }}
        />
        {isSelected && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-primary-foreground" />
          </span>
        )}
      </div>
      <span className="text-sm font-medium text-foreground truncate w-full">{provider.name}</span>
    </button>
  );
}
