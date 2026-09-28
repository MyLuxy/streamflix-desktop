"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { isDiscordPresenceEnabled } from "@/lib/discord-presence";

// titles from these never go on someone's public profile, only that the app is in use
const PRIVATE_PROVIDERS = new Set(["AfterDark"]);

// discord needs a public https url. relative paths are tmdb ones, other hosts get checked in the main process
// (hotlink-protected ones would come out blank) and fall back to the logo there
function publicPoster(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `${TMDB_IMAGE_BASE}/w500${path}`;
  return undefined;
}

interface PresenceOptions {
  provider: string;
  title: string;
  seasonEpisodeLabel?: string;
  posterPath?: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

// desktop only, sends "watching X" to the main process which talks to the local discord client
export function useDiscordPresence(options: PresenceOptions) {
  const { t } = useTranslation();
  const latest = useRef(options);
  latest.current = options;
  const tRef = useRef(t);
  tRef.current = t;
  // nothing goes out until playback actually starts, otherwise the loading seconds show up as "paused"
  const everPlayed = useRef(false);
  const prevTime = useRef(0);

  const push = () => {
    const bridge = window.streamflixDesktop;
    if (!bridge || !isDiscordPresenceEnabled()) return;
    const o = latest.current;

    if (PRIVATE_PROVIDERS.has(o.provider)) {
      bridge.setPresence({ details: "StreamFlix" }).catch(() => {});
      return;
    }

    const paused = !o.isPlaying;
    const kind = o.seasonEpisodeLabel ?? tRef.current("settings.presenceMovie");
    const payload: Record<string, unknown> = {
      details: o.title,
      state: paused ? `${kind} · ${tRef.current("settings.presencePaused")}` : kind,
      posterUrl: publicPoster(o.posterPath),
      paused,
    };
    if (!paused && o.duration > 0) {
      const start = Date.now() - o.currentTime * 1000;
      payload.startTimestamp = start;
      payload.endTimestamp = start + o.duration * 1000;
    }
    bridge.setPresence(payload).catch(() => {});
  };

  const hasDuration = options.duration > 0;
  useEffect(() => {
    if (options.isPlaying) everPlayed.current = true;
    if (everPlayed.current) push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.isPlaying, hasDuration, options.title, options.seasonEpisodeLabel, options.posterPath, options.provider]);

  // a seek shows up as a jump between two timeupdates, normal playback never moves more than a second or two per tick
  useEffect(() => {
    const jumped = Math.abs(options.currentTime - prevTime.current) > 3;
    prevTime.current = options.currentTime;
    if (jumped && options.isPlaying && everPlayed.current) push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.currentTime]);

  useEffect(() => {
    return () => {
      window.streamflixDesktop?.clearPresence().catch(() => {});
    };
  }, []);
}
