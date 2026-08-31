"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Navigation } from "@/components/Navigation";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { ContinueWatchingRow } from "@/components/ContinueWatchingRow";
import { CustomGenreSections } from "@/components/CustomGenreSections";
import { LiveTVRow } from "@/components/LiveTVRow";
import { useContinueWatching, type WatchedItem } from "@/hooks/useContinueWatching";
import { useLocale } from "@/hooks/useLocale";
import { hrefForItem, typeSegment } from "@/lib/links";
import { buildProviderSlug } from "@/lib/slug";
import type { Movie, TVShow, MediaItem } from "@/lib/types";
import type { HomeRow } from "@/lib/streamflix";

interface HomeViewProps {
  rows: HomeRow[];
  // set when the selected provider didnt respond (site down, timeout, network error).
  // no auto retry: a dead provider would just keep slowing down every home load
  // until the user picks a different one
  error?: string | null;
  provider?: string;
  // live-tv channel cards read better as landscape thumbnails than movie/show posters.
  // resolved server-side in page.tsx so it's correct on first paint, no hydration flash
  isIptv?: boolean;
}

export function HomeView({ rows, error, provider, isIptv }: HomeViewProps) {
  const router = useRouter();
  const { t } = useTranslation();

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
    // !== undefined, not a truthy check: for providers like AnimeUnity season 0 is
    // legit and "0" is falsy in JS, with `item.season &&` the resume was silently lost
    if (item.mediaType === "tv" && item.season !== undefined && item.episode !== undefined) {
      href += `?watch=s${item.season}e${item.episode}`;
    } else if (item.mediaType === "movie") {
      // starts playback right away for movies too, not just series. DetailView reads
      // ?watch and resumes from the saved position (see startTime passed to HlsPlayer)
      href += `?watch=1`;
    }
    router.push(href);
  };

  // the provider's first row (usually the "featured"/"trending" one) is used as the hero
  const [heroRow, ...restRows] = rows;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main>
        {!error && heroRow && heroRow.items.length > 0 && (
          <HeroBanner items={heroRow.items} onPlayClick={goToItem} onInfoClick={goToItem} isIptv={isIptv} />
        )}

        <div className="home-content relative z-10 -mt-16 md:-mt-32 pb-24 space-y-10 md:space-y-12">
          {error ? (
            <div className="flex flex-col items-center gap-3 text-center py-24 px-4">
              <AlertTriangle className="w-10 h-10 text-destructive" />
              <p className="text-lg font-semibold text-foreground">
                Impossibile contattare &quot;{provider}&quot;
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                Il provider selezionato non ha risposto. Prova a selezionarne un altro dalle Impostazioni, o riprova più tardi.
              </p>
              <p className="text-xs text-muted-foreground/70 font-mono max-w-md break-words">{error}</p>
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
                  <ContentRow key={row.name} title={row.name} items={row.items} onItemClick={goToItem} isIptv={isIptv} />
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
