"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Navigation } from "@/components/Navigation";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { ContinueWatchingRow } from "@/components/ContinueWatchingRow";
import { CustomGenreSections } from "@/components/CustomGenreSections";
import { LiveTVRow } from "@/components/LiveTVRow";
import { useContinueWatching, type WatchedItem } from "@/hooks/useContinueWatching";
import { useLocale } from "@/hooks/useLocale";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { hrefForItem, typeSegment } from "@/lib/links";
import { buildProviderSlug } from "@/lib/slug";
import type { Movie, TVShow, MediaItem } from "@/lib/types";
import type { HomeRow } from "@/lib/streamflix";

interface HomeViewProps {
  rows: HomeRow[];
  // set when the selected provider didnt respond, no auto retry so a dead one doesnt slow every load
  error?: string | null;
  provider?: string;
  // resolved server-side in page.tsx so live-tv landscape cards are correct on first paint
  isIptv?: boolean;
}

export function HomeView({ rows, error, provider, isIptv }: HomeViewProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (error) console.error(`[StreamFlix] provider "${provider}" non raggiungibile:`, error);
  }, [error, provider]);
  const locale = useLocale();
  const { activeProviderItems: continueWatchingItems } = useContinueWatching();

  const goToItem = (item: Movie | TVShow | MediaItem) => {
    router.push(hrefForItem(locale, item));
  };

  const goToContinue = (item: WatchedItem) => {
    const slug = buildProviderSlug(item.provider, item.realId, item.title);
    let href = `/${locale}/${typeSegment(item.mediaType)}/${slug}`;
    // !== undefined not a truthy check, season 0 (AnimeUnity) is legit but falsy
    if (item.mediaType === "tv" && item.season !== undefined && item.episode !== undefined) {
      href += `?watch=s${item.season}e${item.episode}`;
    } else if (item.mediaType === "movie") {
      href += `?watch=1`;
    }
    router.push(href);
  };

  // the provider's first row (usually the "featured"/"trending" one) is used as the hero
  const [heroRow, ...allRestRows] = rows;
  // HiAnime's own rows mostly duplicate the genre sections below, keep just the new-releases one
  const restRows = provider === "HiAnime"
    ? allRestRows.filter((row) => row.name === "New On HiAnime")
    : allRestRows.filter((row) => row.name !== "Top 10 titoli oggi" && row.name !== "Top 10 titles today");

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main>
        {isOnline && !error && heroRow && heroRow.items.length > 0 && (
          <HeroBanner items={heroRow.items} onPlayClick={goToItem} onInfoClick={goToItem} />
        )}

        <div className="home-content relative z-10 -mt-8 md:-mt-16 pb-24 space-y-10 md:space-y-12">
          {!isOnline ? (
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <WifiOff className="w-10 h-10 text-destructive" />
                <p className="text-lg font-semibold text-foreground">{t("home.offline.title")}</p>
                <p className="text-sm text-muted-foreground max-w-md">{t("home.offline.description")}</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <AlertTriangle className="w-10 h-10 text-destructive" />
                <p className="text-lg font-semibold text-foreground">
                  Impossibile contattare &quot;{provider}&quot;
                </p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Il provider selezionato non ha risposto. Prova a selezionarne un altro dalle Impostazioni, o riprova più tardi.
                </p>
                <p className="text-xs text-muted-foreground/70 font-mono max-w-md break-words">{error}</p>
              </div>
            </div>
          ) : (
            <>
              {continueWatchingItems.length > 0 && (
                <ContinueWatchingRow items={continueWatchingItems} onItemClick={goToContinue} />
              )}

              {restRows.length === 0 && !heroRow ? (
                <p className="text-center text-muted-foreground py-16">
                  Nessun contenuto disponibile per questo provider.
                </p>
              ) : (
                restRows.map((row) => (
                  <ContentRow
                    key={row.name}
                    title={row.name}
                    items={row.items}
                    onItemClick={goToItem}
                    isIptv={isIptv}
                  />
                ))
              )}

              {provider && <CustomGenreSections provider={provider} onItemClick={goToItem} />}

              <LiveTVRow />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
