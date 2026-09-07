"use client";

import { useRouter } from "next/navigation";
import { SimplePageShell } from "@/components/SimplePageShell";
import { DownloadsPage } from "@/components/DownloadsPage";
import { useLocale } from "@/hooks/useLocale";
import { typeSegment } from "@/lib/links";
import { buildProviderSlug } from "@/lib/slug";
import { setSelectedProviderClient } from "@/lib/provider";
import type { DownloadItem } from "@/lib/types";

export function DownloadsView() {
  const router = useRouter();
  const locale = useLocale();

  const open = (item: DownloadItem) => {
    // downloads are unified across providers too, same as the watchlist - opening one
    // switches the app onto its provider if it isn't the active one already
    setSelectedProviderClient(item.provider);
    const slug = buildProviderSlug(item.provider, item.realId, item.title);
    let href = `/${locale}/${typeSegment(item.mediaType)}/${slug}`;
    if (item.mediaType === "tv" && item.season !== undefined && item.episode !== undefined) {
      href += `?watch=s${item.season}e${item.episode}`;
    } else {
      href += `?watch=1`;
    }
    router.push(href);
  };

  return (
    <SimplePageShell>
      <DownloadsPage onItemClick={open} />
    </SimplePageShell>
  );
}
