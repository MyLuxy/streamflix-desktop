"use client";

import { useState, useEffect } from "react";
import { Plus, Check, Star, Clock, Calendar, Video, ArrowLeft } from "lucide-react";
import { PlayIcon } from "@/components/MediaIcons";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import { useEpisodeProgress } from "@/hooks/useEpisodeProgress";
import { useSeasonEpisodes } from "@/hooks/useStreamflix";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { HlsPlayer } from "@/components/HlsPlayer";
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

// titoli lunghi altrimenti si schiacciano/escono dal layout a queste taglie enormi - scala verso
// il basso via via che il titolo si allunga, invece di una taglia fissa unica per tutti
function titleSizeClass(title: string): string {
  if (title.length > 50) return "text-base sm:text-xl md:text-4xl";
  if (title.length > 30) return "text-lg sm:text-2xl md:text-5xl";
  return "text-xl sm:text-3xl md:text-7xl";
}

// Prossimo episodio: stesso episode+1 se resta dentro la stagione corrente, altrimenti il primo
// della stagione successiva (se esiste) - null quando non c'è altro da guardare dopo questo.
// episode_count nella lista stagioni di TVShowDetails è sempre 0 (l'endpoint di dettaglio show
// non porta i conteggi reali, solo useSeasonEpisodes li fetcha per singola stagione) - qui si usa
// il conteggio VERO della stagione corrente passato da fuori, la lista stagioni serve solo a
// sapere SE esiste una stagione successiva (season_number è invece affidabile lì)
function getNextEpisode(
  seasons: Season[],
  currentSeason: number,
  currentEpisode: number,
  currentSeasonEpisodeCount: number | null
): { season: number; episode: number } | null {
  if (currentSeasonEpisodeCount !== null && currentEpisode < currentSeasonEpisodeCount) {
    return { season: currentSeason, episode: currentEpisode + 1 };
  }
  const valid = seasons.filter((s) => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
  const idx = valid.findIndex((s) => s.season_number === currentSeason);
  if (idx === -1) return null;
  const next = valid[idx + 1];
  if (next) return { season: next.season_number, episode: 1 };
  return null;
}

// Interpreta il parametro ?watch dell'URL: "s2e5" → {season:2, episode:5},
// qualsiasi altro valore non vuoto (es. "1" per i film) → riproduzione dall'inizio.
function parseWatchParam(w: string | null): { season: number; episode: number } | null {
  if (!w) return null;
  const m = /^s(\d+)e(\d+)$/i.exec(w);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  return { season: 1, episode: 1 };
}

export function DetailView({ data, mediaType, provider, realId, recommendations = [] }: DetailViewProps) {
  const id = data.id;
  const searchParams = useSearchParams();
  // Stato iniziale del player ricavato dall'URL: così un reload mantiene il player
  // aperto sulla stagione/episodio corretti invece di tornare alla pagina info.
  const initialWatch = parseWatchParam(searchParams.get("watch"));
  const { addItem: addToContinueWatching, updateProgress, items: watchedItems } = useContinueWatching();
  const { updateEpisodeProgress, getEpisodeProgress } = useEpisodeProgress();
  const watchedItem = watchedItems.find((i) => i.provider === provider && i.realId === realId && i.mediaType === mediaType);

  const [playing, setPlaying] = useState(!!initialWatch);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);
  // Usa il watch param dall'URL, oppure il progress salvato, default 1
  const [startSeason, setStartSeason] = useState(
    initialWatch?.season ?? watchedItem?.season ?? 1
  );
  const [startEpisode, setStartEpisode] = useState(
    initialWatch?.episode ?? watchedItem?.episode ?? 1
  );
  // real episode id, known only once the user actually picks an episode from the modal (or
  // undefined when resuming from a bare ?watch=sXeY URL) - HlsPlayer/the backend fall back to
  // matching by season+episode NUMBER in that case, see Backend.kt's handleStream
  const [startEpisodeId, setStartEpisodeId] = useState<string | undefined>(undefined);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [genresExpanded, setGenresExpanded] = useState(false);

  // player a schermo intero (non Fullscreen API, solo layout): blocca lo scroll della pagina
  // sotto, altrimenti resterebbe scrollabile via touch/rotellina dietro l'overlay fisso
  useEffect(() => {
    if (!playing) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [playing]);

  // Stile condiviso tag generi (riusato dal pulsante "+N")
  const tagClass =
    "text-xs md:text-base font-medium bg-secondary text-secondary-foreground px-2 md:px-3 py-0.5 sm:py-1 md:py-1.5 rounded-md";

  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();

  const seasons = mediaType === "tv" && "seasons" in data ? data.seasons : [];
  // conteggio reale episodi della stagione in riproduzione - vedi commento su getNextEpisode
  const { data: currentSeasonEpisodes } = useSeasonEpisodes(
    provider,
    realId,
    mediaType === "tv" ? startSeason : null
  );
  const nextEpisode =
    mediaType === "tv"
      ? getNextEpisode(seasons, startSeason, startEpisode, currentSeasonEpisodes?.length ?? null)
      : null;

  // "Torna indietro": in riproduzione torna alla scheda info dello stesso
  // titolo; altrimenti usa la cronologia nativa del browser (semplice e sempre
  // corretta — porta alla pagina effettivamente precedente).
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

  // Aggiorna il parametro ?watch nell'URL senza navigare (replaceState), così un
  // reload riapre il player; non sporca lo stack del "Torna indietro".
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

  const trailer = data.videos?.results?.find(
    (video) =>
      video.site === "YouTube" &&
      (video.type === "Trailer" || video.type === "Teaser")
  );
  const trailerKey = trailer?.key;

  const inWatchlist = isInWatchlist(id, mediaType);

  const handleToggleWatchlist = () => {
    toggleWatchlist({ id, mediaType, title, posterPath: data.poster_path, provider, realId });
  };

  // Avvia la riproduzione (eventualmente su una stagione/episodio specifici)
  const beginPlayback = (season?: number, episode?: number, episodeId?: string) => {
    // Il progresso salvato (currentTime/duration) va portato avanti SOLO se si sta riprendendo
    // lo stesso episodio già salvato - altrimenti (episodio scelto dal picker, "prossimo
    // episodio", ecc) apparteneva a un episodio diverso e va scartato, altrimenti il nuovo
    // episodio erediterebbe il minutaggio di quello vecchio pur avendo season/episode aggiornati
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
      season: season ?? watchedItem?.season,
      episode: episode ?? watchedItem?.episode,
    });
    if (season && episode) {
      setStartSeason(season);
      setStartEpisode(episode);
      setStartEpisodeId(episodeId);
      setWatchParam(`s${season}e${episode}`);
    } else {
      setWatchParam(mediaType === "tv" ? `s${startSeason}e${startEpisode}` : "1");
    }
    setPlaying(true);
  };

  // Play: per le serie apre prima il selettore episodi; per i film parte subito
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

  // Aggiorna la cronologia quando si cambia episodio dal player
  const backButton = (className: string) => (
    <Button
      onClick={handleBack}
      variant="secondary"
      size="sm"
      className={`back-btn h-9 md:h-11 px-3 md:px-5 text-sm md:text-base md:[&_svg]:size-5 ${className}`}
    >
      <ArrowLeft />
      {t("content.goBack")}
    </Button>
  );

  // ── Sezioni riutilizzabili ──
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

  // Blocco azioni (riproduci / trailer / watchlist)
  const actionButtons = (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      <Button
        onClick={handlePlayClick}
        className="gap-1.5 sm:gap-2 md:gap-3 bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base md:text-2xl h-9 sm:h-11 md:h-16 px-4 sm:px-6 md:px-10 [&_svg]:size-3.5 sm:[&_svg]:size-4 md:[&_svg]:size-8"
      >
        <PlayIcon />
        {t("content.play")}
      </Button>

      {trailerKey && (
        <Button
          onClick={() => setShowTrailer(true)}
          variant="secondary"
          className="gap-1.5 sm:gap-2 md:gap-3 text-sm sm:text-base md:text-xl h-9 sm:h-11 md:h-16 px-4 sm:px-6 md:px-10"
        >
          <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">{t("content.trailer")}</span>
        </Button>
      )}

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
      {!playing && <Navigation />}

      {playing ? (
        // ===== MODALITÀ RIPRODUZIONE: player a schermo intero (layout, non Fullscreen API -
        // quella resta un'azione esplicita dal tasto dedicato dentro HlsPlayer) =====
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
              // riprende solo se il progresso salvato è per QUESTO stesso episodio/film -
              // un episodio/film diverso parte sempre da capo
              watchedItem &&
              (mediaType === "movie" || (watchedItem.season === startSeason && watchedItem.episode === startEpisode))
                ? watchedItem.currentTime
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
            onBack={handleBack}
            nextEpisodeAvailable={!!nextEpisode}
            onNextEpisode={() => {
              if (nextEpisode) beginPlayback(nextEpisode.season, nextEpisode.episode);
            }}
          />
        </div>
      ) : (
        <main className="pb-24">
          {/* ===== MODALITÀ INFO: backdrop, dettagli, consigliati ===== */}
          <div className="relative w-full">
              <div className="relative w-full h-[32vh] min-h-[200px] sm:h-[40vh] md:h-[62vh]">
                {backdropUrl ? (
                  <img
                    src={backdropUrl}
                    alt={title}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-muted" />
                )}
                <div className="detail-backdrop-fade absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
              </div>
              {backButton(
                "absolute top-3 left-3 z-30 gap-1.5 bg-background/60 backdrop-blur-sm hover:bg-background/80 md:top-28 md:left-6"
              )}
            </div>

            <div className="detail-info max-w-5xl mx-auto px-4 sm:px-6 relative z-10 -mt-24 md:-mt-[31vh]">
              <div className="flex gap-4 sm:gap-6 mb-6">
                {posterUrl && (
                  <img
                    src={posterUrl}
                    alt={title}
                    className="detail-poster w-24 sm:w-36 md:w-96 rounded-lg md:rounded-xl shadow-2xl border-2 md:border-4 border-card flex-shrink-0 self-start mt-12 sm:mt-16 md:mt-28"
                  />
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

      {/* Selettore episodi stile Netflix (solo serie) */}
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
          backdropUrl={backdropUrl}
        />
      )}

      {showTrailer && trailerKey && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowTrailer(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl aspect-video"
          >
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
              className="w-full h-full rounded-lg shadow-2xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={`${title} Trailer`}
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
