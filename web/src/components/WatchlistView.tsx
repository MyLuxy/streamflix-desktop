"use client";

import { useRouter } from "next/navigation";
import { SimplePageShell } from "@/components/SimplePageShell";
import { WatchlistPage } from "@/components/WatchlistPage";
import { useLocale } from "@/hooks/useLocale";
import { hrefForItem, typeSegment } from "@/lib/links";
import { buildProviderSlug } from "@/lib/slug";
import { setSelectedProviderClient } from "@/lib/provider";
import type { MediaItem, WatchlistItem } from "@/lib/types";

export function WatchlistView() {
  const router = useRouter();
  const locale = useLocale();

  const open = (item: WatchlistItem) => {
    if (item.provider && item.realId) {
      // unified across providers, opening a title switches the app onto its provider if it differs
      setSelectedProviderClient(item.provider);
      // only reliable way to resolve the item later, the numeric hash fallback below isnt
      const slug = buildProviderSlug(item.provider, item.realId, item.title);
      router.push(`/${locale}/${typeSegment(item.mediaType)}/${slug}`);
      return;
    }
    router.push(
      hrefForItem(locale, {
        id: item.id,
        media_type: item.mediaType,
        poster_path: item.posterPath,
        title: item.title,
        original_title: item.title,
      } as MediaItem)
    );
  };

  return (
    <SimplePageShell>
      <WatchlistPage onItemClick={open} />
    </SimplePageShell>
  );
}
