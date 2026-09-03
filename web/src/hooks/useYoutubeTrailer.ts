"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface YTPlayer {
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  destroy: () => void;
}

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

function loadYoutubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

// plays a muted youtube video once active, destroys the player again on cleanup
export function useYoutubeTrailer(videoId: string | undefined, active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [muted, setMuted] = useState(true);
  // low by default, unmuting a background trailer at full blast is jarring
  const [volume, setVolumeState] = useState(0.2);
  // real onStateChange signal, autoplay start timing is too unpredictable to just guess
  const [playing, setPlaying] = useState(false);
  // youtube shows its own replay button once a video ends, so we hide the player again
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!active || !videoId || !containerRef.current) return;
    let cancelled = false;
    loadYoutubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === YT_STATE_PLAYING) setPlaying(true);
            else if (e.data === YT_STATE_ENDED) setEnded(true);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setPlaying(false);
      setEnded(false);
    };
  }, [active, videoId]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (next) {
        playerRef.current?.mute();
      } else {
        // player's own volume defaults to 100 regardless of our state, keep them in sync
        playerRef.current?.setVolume(volume * 100);
        playerRef.current?.unMute();
      }
      return next;
    });
  }, [volume]);

  const changeVolume = useCallback((next: number) => {
    setVolumeState(next);
    playerRef.current?.setVolume(next * 100);
    setMuted(next === 0);
    if (next === 0) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }, []);

  return { containerRef, muted, volume, toggleMute, changeVolume, playing, ended };
}
