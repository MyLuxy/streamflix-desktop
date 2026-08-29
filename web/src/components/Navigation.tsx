"use client";

import { useEffect, useState } from "react";
import { Home, Search, Bookmark, Settings, Server } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/useLocale";
import { localePath } from "@/lib/links";
import { useTranslation } from "react-i18next";
import { useProviders } from "@/hooks/useStreamflix";
import { getSelectedProviderClient, PROVIDER_CHANGED_EVENT } from "@/lib/provider";
import { proxyImage, PROVIDER_LOGO_FALLBACK } from "@/lib/constants";

const tabs: { path: string; labelKey: string; icon: typeof Home }[] = [
  { path: "/", labelKey: "nav.home", icon: Home },
  { path: "/search", labelKey: "nav.search", icon: Search },
  { path: "/watchlist", labelKey: "nav.watchlist", icon: Bookmark },
  { path: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function Navigation() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const locale = useLocale();

  // logo del provider attivo, mostrato al posto del vecchio toggle tema - letto lato client
  // (cookie) dopo il mount per evitare disallineamenti tra render server e client, e riletto ad
  // ogni cambio provider (Navigation resta montata tra le navigazioni, non si accorgerebbe
  // altrimenti di un cambio fatto dalle Impostazioni finché non viene rimontata)
  const [selectedProviderName, setSelectedProviderName] = useState<string | null>(null);
  useEffect(() => {
    setSelectedProviderName(getSelectedProviderClient());
    const onProviderChanged = () => setSelectedProviderName(getSelectedProviderClient());
    window.addEventListener(PROVIDER_CHANGED_EVENT, onProviderChanged);
    return () => window.removeEventListener(PROVIDER_CHANGED_EVENT, onProviderChanged);
  }, []);
  const { data: providers } = useProviders();
  const currentProviderLogo = providers?.find((p) => p.name === selectedProviderName)?.logo;

  const isActive = (path: string) => {
    const full = localePath(locale, path);
    return path === "/" ? pathname === full : pathname.startsWith(full);
  };

  return (
    <>
      {/* Top navbar (desktop) */}
      <nav className="fixed top-0 left-0 right-0 z-50 hidden md:block">
        <div className="glass border-b border-border/50">
          <div className="flex items-center justify-between px-8 py-1">
            {/* Logo */}
            <div className="flex items-center gap-10">
              <Link href={localePath(locale, "/")} aria-label={t("nav.home")}>
                <img
                  src="/logo.png"
                  alt="StreamFlix"
                  className="h-16 md:h-20 w-auto object-contain"
                />
              </Link>

              {/* Nav links */}
              <div className="flex items-center gap-2">
                {tabs.map((tab) => (
                  <Button
                    key={tab.path}
                    asChild
                    variant={isActive(tab.path) ? "secondary" : "ghost"}
                    size="default"
                    className="gap-2 text-base hover:bg-secondary hover:text-secondary-foreground"
                  >
                    <Link href={localePath(locale, tab.path)}>
                      <tab.icon className="w-5 h-5" />
                      {t(tab.labelKey)}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            {/* Right side - fonte contenuti attiva, porta alle impostazioni per cambiarla.
                Stesso Button/variant/hover dei tab di navigazione, per lo stesso overlay */}
            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="default"
                className="gap-2 text-base hover:bg-secondary hover:text-secondary-foreground"
              >
                <Link href={localePath(locale, "/settings")}>
                  {currentProviderLogo ? (
                    <img
                      src={proxyImage(currentProviderLogo)}
                      alt=""
                      className="w-5 h-5 rounded object-cover flex-shrink-0 bg-muted"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src.endsWith(PROVIDER_LOGO_FALLBACK)) return;
                        img.src = PROVIDER_LOGO_FALLBACK;
                      }}
                    />
                  ) : (
                    <Server className="w-5 h-5" />
                  )}
                  Provider
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom navbar (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="glass border-t border-border/50">
          {/* pb con safe-area: solleva i comandi sopra la barra gesture del telefono */}
          <div className="flex items-center justify-around px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {tabs.map((tab) => {
              const active = isActive(tab.path);
              return (
                <Link
                  key={tab.path}
                  href={localePath(locale, tab.path)}
                  className="flex flex-col items-center gap-1 py-2 px-4"
                >
                  <tab.icon
                    className={`w-5 h-5 ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      active ? "text-primary font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {t(tab.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
