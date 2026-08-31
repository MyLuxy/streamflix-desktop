"use client";

import { useEffect, useState, useRef } from "react";

import { X, Play, Film, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeasonEpisodes, type StreamflixEpisode } from "@/hooks/useStreamflix";
import type { EpisodeProgress } from "@/hooks/useEpisodeProgress";
import { useTranslation } from "react-i18next";
import type { Season } from "@/lib/types";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";
import { Navigation } from "@/components/Navigation";

// past this % counts as watched instead of in progress
const WATCHED_THRESHOLD = 90;

interface EpisodePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  tvId: string;
  seasons: Season[];
  title: string;
  onSelect: (season: number, episodeNumber: number, episodeId: string) => void;
  currentSeason?: number;
  currentEpisode?: number;
  getEpisodeProgress?: (season: number, episode: number) => EpisodeProgress | undefined;
  backdropUrl?: string | null;
}

export function EpisodePickerModal({
  isOpen,
  onClose,
  provider,
  tvId,
  seasons,
  title,
  onSelect,
  currentSeason,
  currentEpisode,
  getEpisodeProgress,
  backdropUrl,
}: EpisodePickerModalProps) {
  const { t } = useTranslation();
  // >=0 not >0, some providers (AnimeUnity) number their first season 0
  const validSeasons = seasons.filter((s) => s.season_number >= 0);
  const [selectedSeason, setSelectedSeason] = useState(
    currentSeason ?? validSeasons[0]?.season_number ?? 1
  );
  const episodeRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const episodesContainerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useSeasonEpisodes(
    provider,
    tvId,
    isOpen ? selectedSeason : null
  );

  // keeps old episodes visible while new season loads, no flash to skeleton
  const [displayedEpisodes, setDisplayedEpisodes] = useState<StreamflixEpisode[]>([]);
  useEffect(() => {
    if (data) setDisplayedEpisodes(data);
  }, [data]);

  useEffect(() => {
    if (!currentEpisode || displayedEpisodes.length === 0) return;
    const btn = episodeRefs.current.get(currentEpisode);
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [displayedEpisodes, currentEpisode]);

  // season switch resets scroll to top, doesnt fight the auto-scroll above
  useEffect(() => {
    if (episodesContainerRef.current) episodesContainerRef.current.scrollTop = 0;
  }, [selectedSeason]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const episodes = displayedEpisodes;

  return (
    // full screen not a centered dialog, more room for episode titles/descriptions
    <div className="fixed inset-0 z-[90] bg-background flex flex-col">
      <Navigation />

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6 md:px-10 pt-6 md:pt-28 pb-4 md:pb-6 border-b border-border flex-shrink-0">
        <Button
          onClick={onClose}
          variant="secondary"
          size="sm"
          className="justify-self-start h-auto py-2 bg-transparent hover:bg-transparent text-foreground text-lg md:text-2xl font-semibold [&_svg]:size-7 md:[&_svg]:size-9"
        >
          <ArrowLeft />
          {t("content.goBack")}
        </Button>

        <div className="min-w-0 text-center">
          <h3 className="text-lg sm:text-xl md:text-3xl font-bold text-foreground truncate">{title}</h3>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="justify-self-end rounded-full flex-shrink-0 w-12 h-12 md:w-14 md:h-14 [&_svg]:size-6 md:[&_svg]:size-8"
        >
          <X />
        </Button>
      </div>

      <div className="flex flex-col md:flex-row min-h-0 flex-1">
        {backdropUrl && (
          <div className="hidden md:block md:w-96 lg:w-[28rem] flex-shrink-0 relative overflow-hidden">
            <img src={backdropUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/55" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/60 to-background" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>
        )}

        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:w-80 lg:w-96 flex-shrink-0 border-b md:border-b-0 md:border-r border-border p-3 md:p-6 scrollbar-hide">
          {validSeasons.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSeason(s.season_number)}
              className={`text-left whitespace-nowrap md:whitespace-normal px-5 py-4 rounded-lg text-base md:text-xl font-medium transition-colors flex-shrink-0 ${
                selectedSeason === s.season_number
                  ? "bg-secondary ring-2 ring-foreground text-foreground"
                  : "hover:bg-secondary/60 text-foreground"
              }`}
            >
              <span className="block">{s.name}</span>
            </button>
          ))}
        </div>

        <div ref={episodesContainerRef} className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 lg:p-8 relative">
          <div className="max-w-6xl space-y-3 md:space-y-4">
            {isFetching
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-4 md:gap-6 p-2 md:p-3">
                    <div className="relative w-40 sm:w-64 md:w-80 aspect-video rounded-lg overflow-hidden flex-shrink-0">
                      <Skeleton className="absolute inset-0 rounded-lg" />
                      <div className="absolute inset-0 neutral-shimmer" />
                    </div>
                    <div className="flex-1 space-y-3 py-2">
                      <Skeleton className="h-5 md:h-7 w-1/2" />
                      <Skeleton className="h-4 md:h-5 w-full" />
                      <Skeleton className="h-4 md:h-5 w-3/4" />
                    </div>
                  </div>
                ))
              : episodes.map((ep) => {
                  const isCurrent = ep.number === currentEpisode && selectedSeason === currentSeason;
                  const epProgress = getEpisodeProgress?.(selectedSeason, ep.number);
                  const isWatched = (epProgress?.progress ?? 0) >= WATCHED_THRESHOLD;
                  return (
                    <button
                      key={ep.id}
                      ref={(el) => {
                        if (el && isCurrent) episodeRefs.current.set(ep.number, el);
                      }}
                      onClick={() => onSelect(selectedSeason, ep.number, ep.id)}
                      className={`w-full flex gap-4 md:gap-6 p-2 md:p-3 rounded-lg transition-colors text-left group ${
                        isCurrent
                          ? "bg-secondary ring-1 ring-foreground/30"
                          : "hover:bg-secondary/60"
                      }`}
                    >
                      <div className="relative w-40 sm:w-64 md:w-80 aspect-video rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {ep.poster ? (
                          <ImageWithSpinner
                            src={ep.poster}
                            alt={ep.title ?? ""}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-10 h-10 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
                            <Play className="w-6 h-6 text-primary-foreground fill-current ml-0.5" />
                          </div>
                        </div>

                        {isWatched ? (
                          <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-4 h-4 text-primary-foreground" />
                          </div>
                        ) : (
                          epProgress && epProgress.progress > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${Math.min(100, epProgress.progress)}%` }}
                              />
                            </div>
                          )
                        )}
                      </div>

                      <div className="flex-1 min-w-0 py-1 md:py-2">
                        <div className="flex items-baseline gap-2 md:gap-3">
                          <span className="text-lg md:text-2xl font-semibold text-foreground">
                            {ep.number}.
                          </span>
                          <span className="text-lg md:text-2xl font-semibold text-foreground truncate">
                            {ep.title}
                          </span>
                        </div>
                        <p className="text-sm md:text-lg text-muted-foreground mt-2 line-clamp-2 md:line-clamp-4">
                          {ep.overview || "—"}
                        </p>
                      </div>
                    </button>
                  );
                })}

            {!isFetching && episodes.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">—</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
