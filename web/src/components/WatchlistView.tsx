"use client";

import { useRouter } from "next/navigation";
import { SimplePageShell } from "@/components/SimplePageShell";
import { WatchlistPage } from "@/components/WatchlistPage";
import { useLocale } from "@/hooks/useLocale";
import { hrefForItem, typeSegment } from "@/lib/links";
import { buildProviderSlug } from "@/lib/slug";
import type { MediaItem, WatchlistItem } from "@/lib/types";

export function WatchlistView() {
  const router = useRouter();
  const locale = useLocale();

  const open = (item: WatchlistItem) => {
    if (item.mediaType === "hentai") {
      // Riapre il titolo nel modale della pagina hentai (via ?watch=slug).
      const q = new URLSearchParams({ watch: item.slug || "", n: item.title });
      router.push(`/${locale}/category/hentai?${q.toString()}`);
      return;
    }
    if (item.provider && item.realId) {
      // provider+realId reali (vedi slug.ts) - l'unico modo affidabile di risolvere l'item su
      // una richiesta successiva; il fallback sotto (hash numerico) non è più risolvibile
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
