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

interface NavigationProps {
  // mobile bottom bar collides with player controls while playing, so we hide just that one
  hideMobileBar?: boolean;
}

export function Navigation({ hideMobileBar = false }: NavigationProps = {}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const locale = useLocale();

  // reread after mount to avoid ssr mismatch, listens for changes since nav stays mounted across pages
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
      <nav className="fixed top-0 left-0 right-0 z-[65] hidden md:block">
        <div className="glass border-b border-border/50">
          <div className="flex items-center justify-between px-8 py-1">
            <div className="flex items-center gap-10">
              <Link href={localePath(locale, "/")} aria-label={t("nav.home")}>
                <img
                  src="/logo.png"
                  alt="StreamFlix"
                  className="h-16 md:h-20 w-auto object-contain"
                />
              </Link>

              <div className="flex items-center gap-2">
                {tabs.map((tab) => (
                  <Button
                    key={tab.path}
                    asChild
                    variant={isActive(tab.path) ? "secondary" : "ghost"}
                    size="lg"
                    className="gap-2 text-lg h-14 hover:bg-secondary hover:text-secondary-foreground"
                  >
                    <Link href={localePath(locale, tab.path)}>
                      <tab.icon className="w-6 h-6" />
                      {t(tab.labelKey)}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="gap-2 text-lg hover:bg-secondary hover:text-secondary-foreground"
              >
                <Link href={localePath(locale, "/settings")}>
                  {currentProviderLogo ? (
                    <img
                      src={proxyImage(currentProviderLogo)}
                      alt=""
                      className="w-6 h-6 rounded object-cover flex-shrink-0 bg-muted"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src.endsWith(PROVIDER_LOGO_FALLBACK)) return;
                        img.src = PROVIDER_LOGO_FALLBACK;
                      }}
                    />
                  ) : (
                    <Server className="w-6 h-6" />
                  )}
                  Provider
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <nav className={`fixed bottom-0 left-0 right-0 z-[65] md:hidden ${hideMobileBar ? "hidden" : ""}`}>
        <div className="glass border-t border-border/50">
          {/* extra bottom padding for phones with a gesture bar */}
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
                    className={`w-7 h-7 ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-sm ${
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
