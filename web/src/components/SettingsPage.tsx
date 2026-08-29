import { Languages, Server, Check, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { languages } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/hooks/useLocale";
import { useProviders } from "@/hooks/useStreamflix";
import { getSelectedProviderClient, setSelectedProviderClient } from "@/lib/provider";
import { proxyImage, PROVIDER_LOGO_FALLBACK } from "@/lib/constants";
import { LanguageFilterDropdown } from "@/components/LanguageFilterDropdown";

export function SettingsPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = useLocale();
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");
  const [providerLangFilter, setProviderLangFilter] = useState<string | null>(null);

  useEffect(() => {
    setSelectedProvider(getSelectedProviderClient());
  }, []);

  const changeProvider = (name: string) => {
    if (name === selectedProvider) return;
    setSelectedProviderClient(name);
    setSelectedProvider(name);
    router.refresh();
  };

  const changeLanguage = (lng: string) => {
    if (lng === currentLocale) return;
    // Memorizza la preferenza e ricarica la STESSA pagina nella nuova lingua
    // (reload completo: tutto viene rigenerato lato server, niente residui)
    document.cookie = `NEXT_LOCALE=${lng};path=/;max-age=31536000;samesite=lax`;
    const parts = pathname.split("/");
    parts[1] = lng; // sostituisce il prefisso lingua
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

  return (
    <div className="max-w-6xl mx-auto px-1 md:px-0 -mt-6 md:mt-0">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-8 md:mb-12">
          {t('settings.title')}
        </h1>

        {/* Language setting - FIRST */}
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

        {/* Provider setting - quale sito fa da fonte per catalogo e streaming */}
        <section className="bg-card rounded-2xl p-5 md:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 md:mb-6">
            <div className="flex items-center gap-3">
              <Server className="w-6 h-6 md:w-7 md:h-7 text-primary flex-shrink-0" />
              <div>
                <p className="font-semibold text-lg md:text-xl text-foreground">{t('settings.contentSource')}</p>
                <p className="text-sm md:text-base text-muted-foreground">
                  {t('settings.contentSourceDesc')}
                  {selectedProvider ? t('settings.contentSourceCurrent', { provider: selectedProvider }) : ""}
                </p>
              </div>
            </div>

            {/* Ricerca + filtro lingua - così scegliere tra ~76 provider resta comodo */}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 max-h-[36rem] overflow-y-auto pr-1">
              {filteredProviders.map((p) => {
                const isSelected = selectedProvider === p.name;
                return (
                  <button
                    key={p.name}
                    onClick={() => changeProvider(p.name)}
                    className={`flex flex-col items-center gap-2.5 rounded-xl border-2 px-3 py-4 text-center transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 hover:bg-secondary/60"
                    }`}
                  >
                    <div className="relative">
                      <img
                        src={proxyImage(p.logo)}
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
                    <span className="text-sm font-medium text-foreground truncate w-full">{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </motion.div>
    </div>
  );
}
