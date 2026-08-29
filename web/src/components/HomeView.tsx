"use client";

import { useRouter } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { ContinueWatchingRow } from "@/components/ContinueWatchingRow";
import { LiveTVRow } from "@/components/LiveTVRow";
import { useContinueWatching, type WatchedItem } from "@/hooks/useContinueWatching";
import { useLocale } from "@/hooks/useLocale";
import { hrefForItem, typeSegment } from "@/lib/links";
import { buildProviderSlug } from "@/lib/slug";
import type { Movie, TVShow, MediaItem } from "@/lib/types";
import type { HomeRow } from "@/lib/streamflix";

export function HomeView({ rows }: { rows: HomeRow[] }) {
  const router = useRouter();
  const locale = useLocale();
  const { activeProviderItems: continueWatchingItems } = useContinueWatching();

  const goToItem = (item: Movie | TVShow | MediaItem) => {
    router.push(hrefForItem(locale, item));
  };

  const goToContinue = (item: WatchedItem) => {
    const slug = buildProviderSlug(item.provider, item.realId, item.title);
    let href = `/${locale}/${typeSegment(item.mediaType)}/${slug}`;
    if (item.mediaType === "tv" && item.season && item.episode) {
      href += `?watch=s${item.season}e${item.episode}`;
    } else if (item.mediaType === "movie") {
      // avvia subito la riproduzione anche per i film, non solo per le serie - DetailView legge
      // ?watch e riprende dal punto salvato (vedi startTime passato a HlsPlayer)
      href += `?watch=1`;
    }
    router.push(href);
  };

  // la prima riga del provider (di solito quella "in evidenza"/"tendenza") fa da hero
  const [heroRow, ...restRows] = rows;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main>
        {heroRow && heroRow.items.length > 0 && (
          <HeroBanner items={heroRow.items} onPlayClick={goToItem} onInfoClick={goToItem} />
        )}

        <div className="home-content relative z-10 -mt-16 md:-mt-32 pb-24 space-y-10 md:space-y-12">
          {continueWatchingItems.length > 0 && (
            <ContinueWatchingRow items={continueWatchingItems} onItemClick={goToContinue} />
          )}

          {restRows.length === 0 && !heroRow ? (
            <p className="text-center text-muted-foreground py-16">
              Nessun contenuto disponibile per questo provider.
            </p>
          ) : (
            restRows.map((row) => (
              <ContentRow key={row.name} title={row.name} items={row.items} onItemClick={goToItem} />
            ))
          )}

          <LiveTVRow />
        </div>
      </main>
    </div>
  );
}
