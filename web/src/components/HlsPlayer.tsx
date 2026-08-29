"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Loader2,
  TriangleAlert,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  ArrowLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BACKEND_URL } from "@/lib/backend";
import { resolveStream } from "@/hooks/useStreamflix";
import { PlayIcon, PauseIcon, SkipIcon, NextIcon } from "@/components/MediaIcons";

interface HlsPlayerProps {
  provider: string;
  itemId: string;
  mediaType: "movie" | "tv";
  seasonNumber?: number;
  episodeId?: string;
  episodeNumber?: number;
  title: string;
  // "S2:Ep1" - solo serie, mostrato accanto al titolo nella barra controlli
  seasonEpisodeLabel?: string;
  // secondi da cui riprendere ("continua a guardare") - ignorato se non impostato o troppo
  // vicino all'inizio, così non si "salta" per un progresso trascurabile
  startTime?: number;
  // riportato periodicamente (ogni ~5s) e alla pausa/smontaggio, con la posizione REALE del
  // video - prima di questo il progresso salvato non seguiva mai la riproduzione effettiva
  onProgress?: (currentTime: number, duration: number) => void;
  onBack: () => void;
  // solo serie: se c'è un episodio successivo, mostra il pulsante in alto a destra
  nextEpisodeAvailable?: boolean;
  onNextEpisode?: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// StreamFlix's own player: a plain <video> element with hls.js feeding it, instead of an embed
// iframe (VixSrc/VidSrc/...) - native browser chrome è sostituito da controlli custom (vedi sotto)
// così l'esperienza è coerente su tutti i provider. Il backend risolve lo stream reale e proxa
// ogni richiesta di segmento/chiave (spoofando Referer/User-Agent richiesti da alcuni provider,
// cosa che un browser non può mai fare da sé su una richiesta cross-origin) - vedi Backend.kt.
export function HlsPlayer({
  provider,
  itemId,
  mediaType,
  seasonNumber,
  episodeId,
  episodeNumber,
  title,
  seasonEpisodeLabel,
  startTime,
  onProgress,
  onBack,
  nextEpisodeAvailable,
  onNextEpisode,
}: HlsPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // barra di avanzamento: durante il drag mostra la posizione provvisoria, non ancora applicata
  // al video (evita un seek per ogni pixel di movimento del puntatore)
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  // controlli overlay: sempre visibili in pausa/caricamento, altrimenti si nascondono dopo
  // qualche secondo di inattività - il comportamento standard di ogni player "da salotto"
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const wake = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (!isPlaying) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setShowControls(true);
      return;
    }
    scheduleHide();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, scheduleHide]);

  // riporta la posizione reale del <video> - al massimo ogni 5s mentre riproduce, e sempre alla
  // pausa/smontaggio (cambio episodio, navigazione via, ecc), così l'ultima posizione non si perde
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let lastSaved = 0;
    const save = () => {
      if (!video.currentTime) return;
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      onProgressRef.current?.(video.currentTime, dur);
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const now = Date.now();
      if (now - lastSaved < 5000) return;
      lastSaved = now;
      save();
    };
    const onDurationChange = () => setDuration(isFinite(video.duration) ? video.duration : 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      save();
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("volumechange", onVolumeChange);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("volumechange", onVolumeChange);
      save();
    };
  }, []);

  useEffect(() => {
    // catturato una volta qui, non riletto da videoRef.current nella cleanup - per il momento in
    // cui quella gira React potrebbe già aver scollegato il ref dal nodo DOM
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    resolveStream(provider, itemId, mediaType, seasonNumber, episodeId, episodeNumber).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.manifestUrl) {
        setStatus("error");
        setErrorMessage(result.error || "Stream non disponibile");
        return;
      }

      const manifestUrl = `${BACKEND_URL}${result.manifestUrl}`;

      // "continua a guardare": riprende da dove interrotto, ignorando progressi trascurabili
      // (vicini a zero) per cui riprendere da capo non fa differenza
      const applyStartTime = () => {
        if (startTime && startTime > 5) {
          video.currentTime = startTime;
        }
      };

      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setStatus("error");
            setErrorMessage(`${data.type}: ${data.details}`);
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!cancelled) setStatus("playing");
          applyStartTime();
          video.play().catch(() => {});
        });
        hls.loadSource(manifestUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = manifestUrl;
        video.addEventListener("loadedmetadata", () => {
          if (!cancelled) setStatus("playing");
          applyStartTime();
          video.play().catch(() => {});
        });
      } else {
        setStatus("error");
        setErrorMessage("HLS non supportato in questo browser");
      }
    });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      // hls.destroy() ferma il caricamento dei segmenti ma non mette in pausa il <video> -
      // se c'era gia buffer scaricato l'elemento continua a riprodurre (e quindi a far scattare
      // timeupdate, quindi onProgress) anche a smontaggio avvenuto, salvando minutaggio sul
      // titolo sbagliato quando nel frattempo si e navigato altrove. load() dopo aver tolto
      // il src interrompe subito qualunque riproduzione/decodifica in corso dal buffer.
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    // startTime deliberatamente escluso: va letto solo al caricamento iniziale (seek una tantum).
    // onProgress lo aggiorna ogni ~5s mentre si guarda - tenerlo nelle dep avrebbe ricaricato
    // l'intero stream da capo ad ogni tick, il loop di "va in caricamento ogni 2 secondi"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, itemId, mediaType, seasonNumber, episodeId, episodeNumber]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // drag della barra di avanzamento: ascolta pointermove/pointerup su tutta la finestra così il
  // trascinamento resta fluido anche se il puntatore esce dalla barra stessa
  useEffect(() => {
    if (!dragging) return;
    const seekToClientX = (clientX: number) => {
      const bar = progressBarRef.current;
      if (!bar || !duration) return null;
      const rect = bar.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return frac * duration;
    };
    const onMove = (e: PointerEvent) => {
      const t = seekToClientX(e.clientX);
      if (t !== null) setDragTime(t);
    };
    const onUp = (e: PointerEvent) => {
      const t = seekToClientX(e.clientX);
      if (t !== null && videoRef.current) videoRef.current.currentTime = t;
      setDragging(false);
      setDragTime(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, duration]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const skip = (deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video || !isFinite(video.duration)) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + deltaSeconds), video.duration);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    video.muted = v === 0;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current?.requestFullscreen().catch(() => {});
    }
  };

  const displayedTime = dragging && dragTime !== null ? dragTime : currentTime;
  const progressPct = duration > 0 ? (displayedTime / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className={`group relative w-full h-full bg-black select-none ${
        showControls ? "" : "cursor-none"
      }`}
      onMouseMove={wake}
      onClick={(e) => {
        // click sul video stesso (non sui controlli) fa play/pause, come su ogni player nativo
        if (e.target === videoRef.current) togglePlay();
        wake();
      }}
    >
      {/* niente attributo title: il tooltip nativo del browser comparirebbe da solo tenendo
          il cursore fermo sopra il player, il titolo lo mostriamo già noi nella barra controlli */}
      <video ref={videoRef} className="w-full h-full" playsInline />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 text-center px-4">
          <TriangleAlert className="w-8 h-8 text-amber-400" />
          <p className="text-sm text-white/80">{errorMessage}</p>
        </div>
      )}

      {status === "playing" && (
        <>
          {/* Overlay superiore: indietro + prossimo episodio */}
          <div
            className={`absolute top-0 inset-x-0 flex items-center justify-between px-4 md:px-8 pt-4 md:pt-6 pb-16 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              onClick={onBack}
              aria-label={t("player.back")}
              className="text-white/90 hover:text-white transition-colors drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
            >
              <ArrowLeft
                className="w-12 h-12 md:w-16 md:h-16"
                strokeWidth={2}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </button>

            {mediaType === "tv" && nextEpisodeAvailable && (
              <button
                onClick={onNextEpisode}
                className="flex items-center gap-2 md:gap-3 text-white/90 hover:text-white text-base md:text-lg font-medium transition-colors drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
              >
                <NextIcon className="w-12 h-12 md:w-16 md:h-16" />
                {t("player.nextEpisode")}
              </button>
            )}
          </div>

          {/* Tasto play/pausa centrale - icona nuda, nessun cerchio attorno */}
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-white transition-opacity duration-300 ${
              showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {buffering ? (
              <Loader2 className="w-20 h-20 md:w-28 md:h-28 animate-spin" />
            ) : isPlaying ? (
              <PauseIcon className="w-20 h-20 md:w-28 md:h-28" />
            ) : (
              <PlayIcon className="w-20 h-20 md:w-28 md:h-28" />
            )}
          </button>

          {/* Barra controlli inferiore */}
          <div
            className={`absolute bottom-0 inset-x-0 px-4 md:px-8 pb-3 md:pb-5 pt-20 bg-gradient-to-t from-black/85 to-transparent transition-opacity duration-300 ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Linea di riproduzione */}
            <div
              ref={progressBarRef}
              onPointerDown={(e) => {
                setDragging(true);
                const rect = e.currentTarget.getBoundingClientRect();
                const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                setDragTime(frac * duration);
              }}
              className="group/progress relative h-4 flex items-center cursor-pointer mb-3 md:mb-4"
            >
              <div className="relative w-full h-1.5 group-hover/progress:h-2 transition-all rounded-full bg-white/25">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white opacity-0 group-hover/progress:opacity-100 transition-opacity"
                  style={{ left: `calc(${progressPct}% - 8px)` }}
                />
              </div>
            </div>

            {/* Riga controlli - icone nude, nessuno sfondo a pillola */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 md:gap-5 min-w-0">
                <button onClick={togglePlay} className="text-white/90 hover:text-white transition-colors flex-shrink-0">
                  {isPlaying ? (
                    <PauseIcon className="w-11 h-11 md:w-14 md:h-14" />
                  ) : (
                    <PlayIcon className="w-11 h-11 md:w-14 md:h-14" />
                  )}
                </button>

                <button
                  onClick={() => skip(-10)}
                  aria-label="-10s"
                  className="text-white/90 hover:text-white transition-colors w-10 h-10 md:w-12 md:h-12 flex-shrink-0"
                >
                  <SkipIcon direction="back" className="w-full h-full" />
                </button>
                <button
                  onClick={() => skip(10)}
                  aria-label="+10s"
                  className="text-white/90 hover:text-white transition-colors w-10 h-10 md:w-12 md:h-12 flex-shrink-0"
                >
                  <SkipIcon direction="forward" className="w-full h-full" />
                </button>

                <div className="group/volume flex items-center gap-2 flex-shrink-0">
                  <button onClick={toggleMute} className="text-white/90 hover:text-white transition-colors">
                    <VolumeIcon className="w-7 h-7 md:w-9 md:h-9" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover/volume:w-16 md:group-hover/volume:w-24 opacity-0 group-hover/volume:opacity-100 transition-all duration-200 accent-white h-1 cursor-pointer"
                  />
                </div>

                <div className="min-w-0 hidden sm:block">
                  <p className="text-white text-base md:text-lg font-medium truncate">
                    {title}
                    {seasonEpisodeLabel && (
                      <span className="text-white/60 font-normal ml-2">{seasonEpisodeLabel}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 md:gap-5 flex-shrink-0 relative">
                <button onClick={toggleFullscreen} className="text-white/90 hover:text-white transition-colors">
                  {isFullscreen ? (
                    <Minimize className="w-7 h-7 md:w-9 md:h-9" />
                  ) : (
                    <Maximize className="w-7 h-7 md:w-9 md:h-9" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
