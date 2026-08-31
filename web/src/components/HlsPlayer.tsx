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
  Captions,
  SignalHigh,
  Clock,
  AudioLines,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BACKEND_URL } from "@/lib/backend";
import { resolveStream, type StreamServer } from "@/hooks/useStreamflix";
import { PlayIcon, PauseIcon, SkipIcon, NextIcon } from "@/components/MediaIcons";

interface HlsPlayerProps {
  provider: string;
  itemId: string;
  mediaType: "movie" | "tv";
  seasonNumber?: number;
  episodeId?: string;
  episodeNumber?: number;
  title: string;
  seasonEpisodeLabel?: string;
  // ignored if too close to zero, not worth resuming from
  startTime?: number;
  // audio label saved from a previous session (see audioLabel), resumes in the same track
  preferredAudioTrack?: string;
  onProgress?: (currentTime: number, duration: number) => void;
  onAudioTrackChange?: (label: string) => void;
  onBack: () => void;
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

// most servers are just mirrors named after the host, sites like hianime tag sub/dub
// in the name instead, that maps to the actual spoken language so the picker reads clean
function audioLabel(name: string): string {
  const tag = name.match(/\b(sub|dub)\b/i);
  if (!tag) return name;
  return tag[1].toLowerCase() === "sub" ? "Japanese" : "English";
}

// mirrors of the same file arent audio tracks, only show the tab when servers actually
// look like language variants (hianime style), not just interchangeable hosts
function hasAudioVariants(servers: StreamServer[]): boolean {
  return servers.length > 1 && servers.some((s) => /\b(sub|dub)\b/i.test(s.name));
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type SettingsTab = "quality" | "speed" | "audio" | "subtitles";

// custom video+hls.js instead of an embed iframe, backend proxies segments and spoofs
// headers browsers cant set on a cross origin request
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
  preferredAudioTrack,
  onProgress,
  onAudioTrackChange,
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
  const [subtitles, setSubtitles] = useState<{ label: string; url: string; default: boolean }[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // shows a temp position while dragging, not a seek per pixel moved
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [servers, setServers] = useState<StreamServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>(undefined);
  // undefined = follow whatever track came back marked default, null = "Off" was picked
  const [selectedSubtitleUrl, setSelectedSubtitleUrl] = useState<string | null | undefined>(undefined);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("subtitles");
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  // keeps playback position across a manual audio switch, startTime prop is only the initial resume
  const resumeTimeRef = useRef<number | null>(null);

  const [playbackRate, setPlaybackRate] = useState(1);
  const [levels, setLevels] = useState<{ height: number }[]>([]);
  // null = auto (abr picks it), otherwise a pinned hls.js level index
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const selectedLevelRef = useRef(selectedLevel);
  selectedLevelRef.current = selectedLevel;
  // switching hls.js levels mid-buffer causes stutter/freezes, pause first and resume
  // once LEVEL_SWITCHED confirms the new one actually loaded
  const pendingQualityChangeRef = useRef(false);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onAudioTrackChangeRef = useRef(onAudioTrackChange);
  onAudioTrackChangeRef.current = onAudioTrackChange;
  const preferredAudioTrackRef = useRef(preferredAudioTrack);
  preferredAudioTrackRef.current = preferredAudioTrack;

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

  // real position, saved every ~5s and on pause/unmount
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

  // an audio/subtitle pick belongs to one episode, a new one starts back on the provider default
  useEffect(() => {
    setSelectedServerId(undefined);
    setSelectedSubtitleUrl(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, episodeId]);

  useEffect(() => {
    if (!showSettingsMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!settingsMenuRef.current?.contains(e.target as Node)) setShowSettingsMenu(false);
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [showSettingsMenu]);

  // playbackRate resets to 1 whenever a fresh src loads, keep it pinned across reloads
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, status]);

  // the default attr on <track> isnt reliable once tracks change dynamically, force it.
  // undefined means no manual pick yet, follow whatever track came back marked default
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const activeUrl = selectedSubtitleUrl === undefined
      ? subtitles.find((s) => s.default)?.url ?? null
      : selectedSubtitleUrl;
    subtitles.forEach((s, i) => {
      const track = video.textTracks[i];
      if (track) track.mode = s.url === activeUrl ? "showing" : "disabled";
    });
  }, [subtitles, selectedSubtitleUrl]);

  useEffect(() => {
    // captured once here, cleanup runs after react may have already unset the ref
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    resolveStream(provider, itemId, mediaType, seasonNumber, episodeId, episodeNumber, selectedServerId).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.manifestUrl) {
        // raw backend errors arent user friendly, log em and show a generic message
        console.error("[StreamFlix] stream error:", result.error);
        setStatus("error");
        setErrorMessage(t("player.streamUnavailable"));
        return;
      }

      const resultServers = result.servers ?? [];

      // first pass (no manual pick yet), a saved preference from last time wins over
      // whatever the provider defaulted to, requires resolving this one again
      if (selectedServerId === undefined && preferredAudioTrackRef.current) {
        const preferred = resultServers.find((s) => audioLabel(s.name) === preferredAudioTrackRef.current);
        if (preferred && preferred.id !== resultServers[0]?.id) {
          setSelectedServerId(preferred.id);
          return;
        }
      }

      setServers(resultServers);
      setSubtitles(result.subtitles ?? []);
      setLevels([]);
      const activeServerId = selectedServerId ?? resultServers[0]?.id;
      const activeServer = resultServers.find((s) => s.id === activeServerId);
      if (activeServer) onAudioTrackChangeRef.current?.(audioLabel(activeServer.name));

      const manifestUrl = `${BACKEND_URL}${result.manifestUrl}`;

      const applyStartTime = () => {
        const resume = resumeTimeRef.current ?? startTime;
        resumeTimeRef.current = null;
        if (resume && resume > 5) {
          video.currentTime = resume;
        }
      };

      if (result.type === "direct") {
        // no playlist here, just a regular file the video tag can handle on its own
        video.src = manifestUrl;
        video.addEventListener("loadedmetadata", () => {
          if (!cancelled) setStatus("playing");
          applyStartTime();
          video.play().catch(() => {});
        });
      } else if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error("[StreamFlix] hls fatal error:", data.type, data.details);
            setStatus("error");
            setErrorMessage(t("player.streamError"));
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (!cancelled) setStatus("playing");
          setLevels(data.levels.map((l) => ({ height: l.height })));
          if (selectedLevelRef.current !== null) hls.currentLevel = selectedLevelRef.current;
          applyStartTime();
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          if (!pendingQualityChangeRef.current) return;
          pendingQualityChangeRef.current = false;
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
        setErrorMessage(t("player.hlsUnsupported"));
      }
    });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      // destroy() doesnt pause the video, buffered content keeps playing (and saving
      // progress onto the wrong title) unless we stop it here too
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    // startTime and onProgress excluded on purpose, or this reloads the stream every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, itemId, mediaType, seasonNumber, episodeId, episodeNumber, selectedServerId]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // listens on the whole window so dragging stays smooth off the bar
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

  const selectServer = (id: string) => {
    if (id === selectedServerId) return;
    resumeTimeRef.current = videoRef.current?.currentTime ?? null;
    setSelectedServerId(id);
  };

  const selectSubtitle = (url: string | null) => {
    setSelectedSubtitleUrl(url);
  };

  const selectQuality = (index: number | null) => {
    setSelectedLevel(index);
    const hls = hlsRef.current;
    if (!hls) return;
    pendingQualityChangeRef.current = true;
    videoRef.current?.pause();
    hls.currentLevel = index ?? -1;
  };

  const selectSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const displayedTime = dragging && dragTime !== null ? dragTime : currentTime;
  const progressPct = duration > 0 ? (displayedTime / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const activeSubtitleUrl = selectedSubtitleUrl === undefined
    ? subtitles.find((s) => s.default)?.url ?? null
    : selectedSubtitleUrl;
  const activeServerId = selectedServerId ?? servers[0]?.id;
  const showAudioTab = hasAudioVariants(servers);
  const showQualityTab = levels.length > 0;
  const showSettingsButton = showAudioTab || subtitles.length > 0 || showQualityTab;
  const tabIconClass = (tab: SettingsTab) =>
    `p-2.5 rounded transition-colors ${activeTab === tab ? "text-card-foreground bg-white/10" : "text-card-foreground/50 hover:text-card-foreground/80"}`;
  const optionRowClass = (active: boolean) =>
    `w-full text-left px-4 py-2.5 text-sm md:text-base transition-colors ${active ? "text-primary font-semibold" : "text-card-foreground/90 hover:bg-white/5"}`;

  return (
    <div
      ref={containerRef}
      className={`group relative w-full h-full bg-black select-none ${
        showControls ? "" : "cursor-none"
      }`}
      onMouseMove={wake}
      onClick={(e) => {
        if (e.target === videoRef.current) togglePlay();
        wake();
      }}
    >
      {/* no title attr, the native tooltip would fight our own label in the controls bar */}
      <video ref={videoRef} className="w-full h-full" playsInline crossOrigin="anonymous">
        {subtitles.map((s) => (
          <track key={s.url} kind="subtitles" src={`${BACKEND_URL}${s.url}`} label={s.label} default={s.default} />
        ))}
      </video>

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/90 text-center px-4">
          <TriangleAlert className="w-14 h-14 text-amber-400" />
          <p className="text-lg md:text-xl text-white/90 max-w-md">{errorMessage}</p>
          <button
            onClick={onBack}
            className="flex items-center gap-2 bg-white hover:bg-white/90 text-black text-sm md:text-base font-semibold rounded-full px-6 py-3 shadow-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            {t("player.back")}
          </button>
        </div>
      )}

      {status === "playing" && (
        <>
          {/* pt-24 on desktop so this doesnt hide under the navbar */}
          <div
            className={`absolute top-0 inset-x-0 flex items-center justify-between px-4 md:px-8 pt-4 md:pt-24 pb-16 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
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

          <div
            className={`absolute bottom-0 inset-x-0 px-4 md:px-8 pb-3 md:pb-5 pt-20 bg-gradient-to-t from-black/85 to-transparent transition-opacity duration-300 ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
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
                {showSettingsButton && (
                  <div className="relative" ref={settingsMenuRef}>
                    <button
                      onClick={() => setShowSettingsMenu((v) => !v)}
                      aria-label={t("player.audioTrack")}
                      className={`transition-colors ${showSettingsMenu ? "text-white" : "text-white/90 hover:text-white"}`}
                    >
                      <Captions className="w-7 h-7 md:w-9 md:h-9" />
                    </button>
                    {showSettingsMenu && (
                      <div className="absolute bottom-full right-0 mb-3 w-80 md:w-96 bg-card border border-border/50 shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between px-2 py-2 border-b border-border/50">
                          <div className="flex items-center gap-1">
                            {showQualityTab && (
                              <button onClick={() => setActiveTab("quality")} className={tabIconClass("quality")} aria-label={t("player.quality")}>
                                <SignalHigh className="w-7 h-7" />
                              </button>
                            )}
                            <button onClick={() => setActiveTab("speed")} className={tabIconClass("speed")} aria-label={t("player.speed")}>
                              <Clock className="w-7 h-7" />
                            </button>
                            {showAudioTab && (
                              <button onClick={() => setActiveTab("audio")} className={tabIconClass("audio")} aria-label={t("player.audio")}>
                                <AudioLines className="w-7 h-7" />
                              </button>
                            )}
                            {subtitles.length > 0 && (
                              <button onClick={() => setActiveTab("subtitles")} className={tabIconClass("subtitles")} aria-label={t("player.subtitles")}>
                                <Captions className="w-7 h-7" />
                              </button>
                            )}
                          </div>
                          <button onClick={() => setShowSettingsMenu(false)} className="text-card-foreground/60 hover:text-card-foreground p-1">
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="px-4 py-2.5 border-b border-border/50 text-center">
                          <span className="text-sm font-medium text-card-foreground/60 uppercase tracking-wide">
                            {t(`player.${activeTab}`)}
                          </span>
                        </div>

                        <div className="max-h-80 overflow-y-auto py-1">
                          {activeTab === "quality" && (
                            <>
                              <button onClick={() => selectQuality(null)} className={optionRowClass(selectedLevel === null)}>
                                {t("player.auto")}
                              </button>
                              {levels.map((l, i) => (
                                <button key={i} onClick={() => selectQuality(i)} className={optionRowClass(selectedLevel === i)}>
                                  {l.height}p
                                </button>
                              ))}
                            </>
                          )}
                          {activeTab === "speed" &&
                            SPEED_OPTIONS.map((rate) => (
                              <button key={rate} onClick={() => selectSpeed(rate)} className={optionRowClass(playbackRate === rate)}>
                                {rate === 1 ? t("player.normalSpeed") : `${rate}x`}
                              </button>
                            ))}
                          {activeTab === "audio" &&
                            servers.map((s) => (
                              <button key={s.id} onClick={() => selectServer(s.id)} className={optionRowClass(s.id === activeServerId)}>
                                {audioLabel(s.name)}
                              </button>
                            ))}
                          {activeTab === "subtitles" && (
                            <>
                              <button onClick={() => selectSubtitle(null)} className={optionRowClass(activeSubtitleUrl === null)}>
                                {t("player.off")}
                              </button>
                              {subtitles.map((s) => (
                                <button key={s.url} onClick={() => selectSubtitle(s.url)} className={optionRowClass(s.url === activeSubtitleUrl)}>
                                  {s.label}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
