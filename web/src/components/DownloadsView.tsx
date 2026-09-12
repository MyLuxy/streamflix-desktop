"use client";

import { useState } from "react";
import { SimplePageShell } from "@/components/SimplePageShell";
import { DownloadsPage } from "@/components/DownloadsPage";
import { DownloadedPlayer } from "@/components/DownloadedPlayer";
import type { DownloadItem } from "@/lib/types";

export function DownloadsView() {
  const [playing, setPlaying] = useState<DownloadItem | null>(null);

  return (
    <SimplePageShell>
      <DownloadsPage onPlay={setPlaying} />
      {playing && <DownloadedPlayer item={playing} onClose={() => setPlaying(null)} />}
    </SimplePageShell>
  );
}
