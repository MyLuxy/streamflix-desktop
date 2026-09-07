"use client";

import { useEffect, useState } from "react";
import { Home, Search, Bookmark, Download, Settings, Server } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/useLocale";
import { localePath } from "@/lib/links";
import { useTranslation } from "react-i18next";
import { useProviders } from "@/hooks/useStreamflix";
import { getSelectedProviderClient, PROVIDER_CHANGED_EVENT } from "@/lib/provider";
import { proxyImage, GENERIC_PROVIDER_LOGO } from "@/lib/constants";
import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";

// mobile bottom bar keeps its original 4 equally-styled tabs (not a priority to redesign
// right now) - the desktop top bar below treats search as a netflix-style icon-only action
// instead of a tab, and adds downloads there only
const tabs: { path: string; labelKey: string; icon: typeof Home }[] = [
  { path: "/", labelKey: "nav.home", icon: Home },
  { path: "/search", labelKey: "nav.search", icon: Search },
  { path: "/watchlist", labelKey: "nav.watchlist", icon: Bookmark },
  { path: "/settings", labelKey: "nav.settings", icon: Settings },
];

const searchTab = tabs[1];

const desktopTabs: { path: string; labelKey: string; icon: typeof Home }[] = [
  { path: "/", labelKey: "nav.home", icon: Home },
  { path: "/watchlist", labelKey: "nav.watchlist", icon: Bookmark },
  { path: "/downloads", labelKey: "nav.downloads", icon: Download },
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

  const { isDesktop, state: updateState } = useDesktopUpdate();
  // error included on purpose: a failed download still needs the user's attention in settings
  const hasUpdate = isDesktop && updateState.status !== "idle";

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
                <Button
                  asChild
                  variant={isActive(searchTab.path) ? "secondary" : "ghost"}
                  size="lg"
                  className="h-12 w-12 px-0 hover:bg-secondary hover:text-secondary-foreground [&_svg]:size-6"
                  aria-label={t(searchTab.labelKey)}
                >
                  <Link href={localePath(locale, searchTab.path)} title={t(searchTab.labelKey)}>
                    <searchTab.icon />
                  </Link>
                </Button>

                {desktopTabs.map((tab) => (
                  <Button
                    key={tab.path}
                    asChild
                    variant={isActive(tab.path) ? "secondary" : "ghost"}
                    size="lg"
                    className="relative gap-2 text-lg h-12 px-6 hover:bg-secondary hover:text-secondary-foreground [&_svg]:size-6"
                  >
                    <Link href={localePath(locale, tab.path)}>
                      <span className="relative">
                        <tab.icon />
                        {tab.path === "/settings" && hasUpdate && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-background" />
                        )}
                      </span>
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
                className="gap-2 text-lg h-12 px-6 hover:bg-secondary hover:text-secondary-foreground [&_svg]:size-6"
              >
                <Link href={localePath(locale, "/settings")}>
                  {currentProviderLogo ? (
                    <img
                      src={proxyImage(currentProviderLogo)}
                      alt=""
                      className="w-6 h-6 rounded object-cover flex-shrink-0 bg-muted"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src.endsWith(GENERIC_PROVIDER_LOGO)) return;
                        img.src = GENERIC_PROVIDER_LOGO;
                      }}
                    />
                  ) : (
                    <Server />
                  )}
                  Provider
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* mobile only: downloads doesn't fit in the bottom bar without crowding it, so it gets
          its own quiet top-right shortcut instead - filled background, no border, so it reads
          as floating over the page rather than part of a toolbar */}
      <Link
        href={localePath(locale, "/downloads")}
        aria-label={t("nav.downloads")}
        className={`fixed top-3 right-3 z-[65] md:hidden flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm ${
          isActive("/downloads") ? "bg-primary/20 text-primary" : "bg-background/60 text-foreground"
        } ${hideMobileBar ? "hidden" : ""}`}
      >
        <Download className="w-5 h-5" />
      </Link>

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
                  <span className="relative">
                    <tab.icon
                      className={`w-7 h-7 ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    {tab.path === "/settings" && hasUpdate && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-background" />
                    )}
                  </span>
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
