"use client";

import { HlsPlayer } from "@/components/HlsPlayer";
import type { DownloadItem } from "@/lib/types";

interface DownloadedPlayerProps {
  item: DownloadItem;
  onClose: () => void;
}

// same custom player as every other title, just pointed at the local file instead of the provider
export function DownloadedPlayer({ item, onClose }: DownloadedPlayerProps) {
  return (
    <div className="fixed inset-0 z-[95] bg-black">
      <HlsPlayer
        provider={item.provider}
        itemId={item.realId}
        mediaType={item.mediaType}
        directSource={`/api/download/file?path=${encodeURIComponent(item.filePath ?? "")}`}
        title={item.title}
        seasonEpisodeLabel={item.mediaType === "tv" ? `S${item.season}:Ep${item.episode}` : undefined}
        onBack={onClose}
      />
    </div>
  );
}
