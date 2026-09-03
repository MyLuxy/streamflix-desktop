"use client";

import { useState, useEffect } from "react";
import { Plus, Check, Star, Clock, Calendar, ArrowLeft, Volume2, Volume1, VolumeX } from "lucide-react";
import { PlayIcon } from "@/components/MediaIcons";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import { useEpisodeProgress } from "@/hooks/useEpisodeProgress";
import { useArtworkFallback } from "@/hooks/useArtworkFallback";
import { useSeasonEpisodes } from "@/hooks/useStreamflix";
import { useYoutubeTrailer } from "@/hooks/useYoutubeTrailer";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { HlsPlayer } from "@/components/HlsPlayer";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";
import { EpisodePickerModal } from "@/components/EpisodePickerModal";
import { ContentRow } from "@/components/ContentRow";
import { Navigation } from "@/components/Navigation";
import { useLocale } from "@/hooks/useLocale";
import { markRestoreIntent } from "@/lib/scroll-history";
import { popPreviousPath } from "@/lib/nav-history";
import { useTranslation } from "react-i18next";
import type { MovieDetails, TVShowDetails, Movie, TVShow, Season } from "@/lib/types";

interface DetailViewProps {
  data: MovieDetails | TVShowDetails;
  mediaType: "movie" | "tv";
  provider: string;
  realId: string;
  recommendations?: (Movie | TVShow)[];
}

// scales down as title length grows so long ones dont overflow
function titleSizeClass(title: string): string {
  if (title.length > 50) return "text-base sm:text-xl md:text-4xl";
  if (title.length > 30) return "text-lg sm:text-2xl md:text-5xl";
  return "text-xl sm:text-3xl md:text-7xl";
}

// episode_count in the seasons list is always 0, real count comes from useSeasonEpisodes
function getNextEpisode(
  seasons: Season[],
  currentSeason: number,
  currentEpisode: number,
  currentSeasonEpisodeCount: number | null
): { season: number; episode: number } | null {
  if (currentSeasonEpisodeCount !== null && currentEpisode < currentSeasonEpisodeCount) {
    return { season: currentSeason, episode: currentEpisode + 1 };
  }
  const valid = seasons.filter((s) => s.season_number >= 0).sort((a, b) => a.season_number - b.season_number);
  const idx = valid.findIndex((s) => s.season_number === currentSeason);
  if (idx === -1) return null;
  const next = valid[idx + 1];
  if (next) return { season: next.season_number, episode: 1 };
  return null;
}

// s2e5 means season 2 ep 5, anything else just starts from the top
function parseWatchParam(w: string | null): { season: number; episode: number } | null {
  if (!w) return null;
  const m = /^s(\d+)e(\d+)$/i.exec(w);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  return { season: 1, episode: 1 };
}

export function DetailView({ data, mediaType, provider, realId, recommendations = [] }: DetailViewProps) {
  const id = data.id;
  const searchParams = useSearchParams();
  // keeps player state in the url so reload doesnt lose it
  const initialWatch = parseWatchParam(searchParams.get("watch"));
  const { addItem: addToContinueWatching, updateProgress, items: watchedItems } = useContinueWatching();
  const { updateEpisodeProgress, getEpisodeProgress } = useEpisodeProgress();
  const watchedItem = watchedItems.find((i) => i.provider === provider && i.realId === realId && i.mediaType === mediaType);
  const seasons = mediaType === "tv" && "seasons" in data ? data.seasons : [];

  const [playing, setPlaying] = useState(!!initialWatch);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);
  // season 0 is a real thing for some providers (AnimeUnity), cant just default to 1
  const [startSeason, setStartSeason] = useState(
    initialWatch?.season ?? watchedItem?.season ?? seasons[0]?.season_number ?? 1
  );
  const [startEpisode, setStartEpisode] = useState(
    initialWatch?.episode ?? watchedItem?.episode ?? 1
  );
  // undefined when resuming from a bare url, backend falls back to season+episode match
  const [startEpisodeId, setStartEpisodeId] = useState<string | undefined>(undefined);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [genresExpanded, setGenresExpanded] = useState(false);

  // locks body scroll behind the fixed player overlay
  useEffect(() => {
    if (!playing) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [playing]);

  const tagClass =
    "text-xs md:text-base font-medium bg-secondary text-secondary-foreground px-2 md:px-3 py-0.5 sm:py-1 md:py-1.5 rounded-md";

  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();

  const { data: currentSeasonEpisodes } = useSeasonEpisodes(
    provider,
    realId,
    mediaType === "tv" ? startSeason : null
  );
  const nextEpisode =
    mediaType === "tv"
      ? getNextEpisode(seasons, startSeason, startEpisode, currentSeasonEpisodes?.length ?? null)
      : null;

  // back from player returns to the info page, otherwise normal browser history
  const handleBack = () => {
    if (playing) {
      setPlaying(false);
      setWatchParam(null);
      window.scrollTo({ top: 0 });
      return;
    }
    markRestoreIntent();
    const prev = popPreviousPath();
    if (prev) router.push(prev, { scroll: false });
    else router.push(`/${locale}`, { scroll: false });
  };

  // replaceState so reload reopens the player without messing up back history
  const setWatchParam = (value: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("watch", value);
    else url.searchParams.delete("watch");
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const title = "title" in data ? data.title : data.name;
  const dateStr =
    "release_date" in data ? data.release_date : (data as TVShowDetails).first_air_date;
  const year = dateStr ? new Date(dateStr).getFullYear() : null;
  const runtime =
    "runtime" in data
      ? data.runtime
      : "episode_run_time" in data
      ? data.episode_run_time?.[0]
      : null;

  const backdropUrl = imageUrl(data.backdrop_path, IMAGE_SIZES.backdrop.large);
  const posterUrl = imageUrl(data.poster_path, IMAGE_SIZES.poster.medium);
  const { fallbackPoster, fallbackBackdrop, triggerFallback } = useArtworkFallback(
    title, year ? String(year) : undefined, mediaType, provider
  );
  const effectiveBackdropUrl = fallbackBackdrop ?? backdropUrl;
  const effectivePosterUrl = fallbackPoster ?? posterUrl;
  // no native backdrop at all (common for hianime), dont wait for an onError that'll never fire
  useEffect(() => {
    if (!backdropUrl) triggerFallback();
  }, [backdropUrl, triggerFallback]);

  const trailer = data.videos?.results?.find(
    (video) =>
      video.site === "YouTube" &&
      (video.type === "Trailer" || video.type === "Teaser")
  );
  const trailerKey = trailer?.key;

  // hidden behind the poster until playing, no loop (restarting would flash the pause icon again)
  const {
    containerRef: trailerRef,
    muted: trailerMuted,
    volume: trailerVolume,
    toggleMute: toggleTrailerMute,
    changeVolume: changeTrailerVolume,
    playing: trailerPlaying,
    ended: trailerEnded,
  } = useYoutubeTrailer(trailerKey, !!trailerKey);
  const [trailerRevealed, setTrailerRevealed] = useState(false);
  useEffect(() => {
    if (!trailerPlaying) return;
    const timer = setTimeout(() => setTrailerRevealed(true), 4000);
    return () => clearTimeout(timer);
  }, [trailerPlaying]);
  // youtube shows its own replay button once the video ends, so the poster covers it back up
  const trailerShowing = trailerRevealed && !trailerEnded;

  const inWatchlist = isInWatchlist(id, mediaType);

  const handleToggleWatchlist = () => {
    toggleWatchlist({ id, mediaType, title, posterPath: data.poster_path, provider, realId });
  };

  const beginPlayback = (season?: number, episode?: number, episodeId?: string) => {
    // only carry over saved progress if resuming the same episode, otherwise the new
    // one would inherit the old minutes while showing updated season/episode numbers
    const isResumingSameEpisode =
      mediaType === "movie" ||
      (season === undefined && episode === undefined) ||
      (watchedItem?.season === season && watchedItem?.episode === episode);
    addToContinueWatching({
      provider,
      realId,
      mediaType,
      title,
      posterPath: data.poster_path,
      backdropPath: data.backdrop_path,
      currentTime: isResumingSameEpisode ? watchedItem?.currentTime : undefined,
      duration: isResumingSameEpisode ? watchedItem?.duration : undefined,
      audioTrack: isResumingSameEpisode ? watchedItem?.audioTrack : undefined,
      season: season ?? watchedItem?.season,
      episode: episode ?? watchedItem?.episode,
    });
    // season 0 is valid for some providers, cant just check truthiness here
    if (season !== undefined && episode !== undefined) {
      setStartSeason(season);
      setStartEpisode(episode);
      setStartEpisodeId(episodeId);
      setWatchParam(`s${season}e${episode}`);
    } else {
      setWatchParam(mediaType === "tv" ? `s${startSeason}e${startEpisode}` : "1");
    }
    setPlaying(true);
  };

  const handlePlayClick = () => {
    if (mediaType === "tv" && seasons.length > 0) {
      setShowEpisodePicker(true);
      return;
    }
    beginPlayback();
  };

  const handleEpisodePicked = (season: number, episode: number, episodeId: string) => {
    setShowEpisodePicker(false);
    beginPlayback(season, episode, episodeId);
  };

  const backButton = (className: string) => (
    <Button
      onClick={handleBack}
      variant="secondary"
      size="sm"
      className={`back-btn h-auto py-2 bg-transparent hover:bg-transparent text-white text-lg md:text-2xl font-semibold [&_svg]:size-7 md:[&_svg]:size-9 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] [&_svg]:drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] ${className}`}
    >
      <ArrowLeft />
      {t("content.goBack")}
    </Button>
  );

  const overviewSection = (
    <div className="mb-6">
      <h2 className="text-base sm:text-lg md:text-xl font-semibold text-foreground mb-2">
        {t("content.overview")}
      </h2>
      <p
        className={`text-muted-foreground leading-relaxed text-sm sm:text-base md:text-xl break-words ${
          overviewExpanded ? "" : "line-clamp-3"
        }`}
      >
        {data.overview || "—"}
      </p>
      {data.overview && data.overview.length > 150 && (
        <button
          onClick={() => setOverviewExpanded((v) => !v)}
          className="text-primary text-sm font-medium mt-1 hover:underline"
        >
          {overviewExpanded ? t("content.showLess") : t("content.showMore")}
        </button>
      )}
    </div>
  );

  const recsSection =
    recommendations.length > 0 ? (
      <div className="mt-6">
        <ContentRow title={t("content.related")} items={recommendations} resetScroll />
      </div>
    ) : null;

  const actionButtons = (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      <Button
        onClick={handlePlayClick}
        className="gap-1.5 sm:gap-2 md:gap-3 bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base md:text-2xl h-9 sm:h-11 md:h-16 px-4 sm:px-6 md:px-10 [&_svg]:size-3.5 sm:[&_svg]:size-4 md:[&_svg]:size-8"
      >
        <PlayIcon />
        {t("content.play")}
      </Button>

      <Button
        variant="outline"
        onClick={handleToggleWatchlist}
        className="gap-1 sm:gap-2 md:gap-3 text-sm sm:text-base md:text-2xl h-9 sm:h-11 md:h-16 px-3 sm:px-6 md:px-10 [&_svg]:size-3.5 sm:[&_svg]:size-4 md:[&_svg]:size-8"
      >
        {inWatchlist ? (
          <>
            <Check />
            <span className="hidden sm:inline">{t("content.inWatchlist")}</span>
          </>
        ) : (
          <>
            <Plus />
            <span className="hidden sm:inline">{t("content.watchlist")}</span>
          </>
        )}
      </Button>

    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* mobile bar hides during playback, collides with player controls down there */}
      <Navigation hideMobileBar={playing} />

      {playing ? (
        // layout fullscreen, not the real Fullscreen API (thats a button inside HlsPlayer)
        <div className="fixed inset-0 z-[60] bg-black">
          <HlsPlayer
            key={`${startSeason}-${startEpisode}`}
            provider={provider}
            itemId={realId}
            mediaType={mediaType}
            title={title}
            seasonEpisodeLabel={mediaType === "tv" ? `S${startSeason}:Ep${startEpisode}` : undefined}
            seasonNumber={mediaType === "tv" ? startSeason : undefined}
            episodeId={startEpisodeId}
            episodeNumber={mediaType === "tv" ? startEpisode : undefined}
            startTime={
              // only resume if saved progress matches this exact episode
              watchedItem &&
              (mediaType === "movie" || (watchedItem.season === startSeason && watchedItem.episode === startEpisode))
                ? watchedItem.currentTime
                : undefined
            }
            preferredAudioTrack={
              watchedItem &&
              (mediaType === "movie" || (watchedItem.season === startSeason && watchedItem.episode === startEpisode))
                ? watchedItem.audioTrack
                : undefined
            }
            onProgress={(ct, dur) => {
              updateProgress(provider, realId, mediaType, {
                currentTime: ct,
                duration: dur,
                season: mediaType === "tv" ? startSeason : undefined,
                episode: mediaType === "tv" ? startEpisode : undefined,
              });
              if (mediaType === "tv") {
                updateEpisodeProgress(provider, realId, startSeason, startEpisode, { currentTime: ct, duration: dur });
              }
            }}
            onAudioTrackChange={(label) => {
              updateProgress(provider, realId, mediaType, { audioTrack: label });
            }}
            onBack={handleBack}
            nextEpisodeAvailable={!!nextEpisode}
            onNextEpisode={() => {
              if (nextEpisode) beginPlayback(nextEpisode.season, nextEpisode.episode);
            }}
          />
        </div>
      ) : (
        <main className="pb-24">
          <div className="relative w-full">
              <div className="relative w-full h-[32vh] min-h-[200px] sm:h-[40vh] md:h-[62vh]">
                {trailerKey && (
                  <div className="trailer-bg-fill absolute inset-0 overflow-hidden pointer-events-none">
                    <div ref={trailerRef} className="pointer-events-none" />
                  </div>
                )}

                <motion.div
                  initial={false}
                  animate={{ opacity: trailerKey && trailerShowing ? 0 : 1 }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="absolute inset-0 pointer-events-none"
                >
                  {effectiveBackdropUrl ? (
                    <ImageWithSpinner
                      src={effectiveBackdropUrl}
                      alt={title}
                      className="w-full h-full object-cover object-top"
                      onError={triggerFallback}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-muted" />
                  )}
                </motion.div>

                <div className="detail-backdrop-fade absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

                {trailerKey && trailerShowing && (
                  <div className="group/volume absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-full px-2.5 py-2.5 transition-colors">
                    <button
                      onClick={toggleTrailerMute}
                      aria-label={trailerMuted ? t("content.unmute") : t("content.mute")}
                      className="text-white flex-shrink-0"
                    >
                      {trailerMuted || trailerVolume === 0 ? (
                        <VolumeX className="w-7 h-7 md:w-9 md:h-9 translate-x-[3px]" />
                      ) : trailerVolume < 0.5 ? (
                        <Volume1 className="w-7 h-7 md:w-9 md:h-9 translate-x-[3px]" />
                      ) : (
                        <Volume2 className="w-7 h-7 md:w-9 md:h-9 translate-x-[3px]" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={trailerMuted ? 0 : trailerVolume}
                      onChange={(e) => changeTrailerVolume(Number(e.target.value))}
                      aria-label={t("content.volume")}
                      className="w-0 group-hover/volume:w-16 md:group-hover/volume:w-24 opacity-0 group-hover/volume:opacity-100 transition-all duration-200 accent-white h-1 cursor-pointer"
                    />
                  </div>
                )}
              </div>
              {backButton("fixed top-3 left-3 z-30 gap-2 md:top-28 md:left-6")}
            </div>

            <div className="detail-info max-w-5xl mx-auto px-4 sm:px-6 relative z-10 -mt-24 md:-mt-[31vh]">
              <div className="flex gap-4 sm:gap-6 mb-6">
                {effectivePosterUrl && (
                  <div className="detail-poster relative w-24 sm:w-36 md:w-96 aspect-[2/3] rounded-lg md:rounded-xl overflow-hidden shadow-2xl border-2 md:border-4 border-card flex-shrink-0 self-start mt-12 sm:mt-16 md:mt-28">
                    <ImageWithSpinner
                      src={effectivePosterUrl}
                      alt={title}
                      className="w-full h-full object-cover"
                      onError={triggerFallback}
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0 pt-12 sm:pt-16 md:pt-28">
                  <h1 className={`${titleSizeClass(title)} font-bold text-foreground mb-2 pb-1 md:pb-2 leading-normal line-clamp-2 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]`}>
                    {title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm md:text-2xl text-muted-foreground mt-2 md:mt-3 mb-3 sm:mb-4 drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
                    {data.vote_average > 0 && (
                      <span className="flex items-center gap-1 text-primary">
                        <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-7 md:h-7 fill-current" />
                        {data.vote_average.toFixed(1)}
                      </span>
                    )}
                    {year && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-7 md:h-7" />
                        {year}
                      </span>
                    )}
                    {runtime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-7 md:h-7" />
                        {runtime} min
                      </span>
                    )}
                    {mediaType === "tv" && "number_of_seasons" in data && (
                      <span>
                        {data.number_of_seasons} Season
                        {data.number_of_seasons > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {data.genres && data.genres.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-4">
                      {data.genres.map((genre, i) => (
                        <span
                          key={genre.id}
                          className={`${tagClass} ${
                            i > 0 && !genresExpanded ? "hidden sm:inline-block" : ""
                          }`}
                        >
                          {genre.name}
                        </span>
                      ))}
                      {!genresExpanded && data.genres.length > 1 && (
                        <button
                          onClick={() => setGenresExpanded(true)}
                          className={`${tagClass} sm:hidden hover:bg-secondary/80`}
                          aria-label="Mostra altri generi"
                        >
                          +{data.genres.length - 1}
                        </button>
                      )}
                    </div>
                  )}

                  {actionButtons}

                  {data.tagline && (
                    <p className="text-sm sm:text-base italic text-primary mt-4 mb-2">
                      &quot;{data.tagline}&quot;
                    </p>
                  )}

                  <div className="mt-4">
                    {overviewSection}
                  </div>
                </div>
              </div>
            </div>

          {recsSection}
        </main>
      )}

      {showEpisodePicker && (
        <EpisodePickerModal
          isOpen={showEpisodePicker}
          onClose={() => setShowEpisodePicker(false)}
          provider={provider}
          tvId={realId}
          seasons={seasons}
          title={title}
          onSelect={handleEpisodePicked}
          currentSeason={startSeason}
          currentEpisode={startEpisode}
          getEpisodeProgress={(season, episode) => getEpisodeProgress(provider, realId, season, episode)}
          backdropUrl={effectiveBackdropUrl}
        />
      )}
    </div>
  );
}
