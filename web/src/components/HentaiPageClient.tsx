"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Play, Star, Calendar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/Navigation";
import { useLocale } from "@/hooks/useLocale";
import { useTranslation } from "react-i18next";
import { markRestoreIntent } from "@/lib/scroll-history";
import { genreLabel, type HentaiDetail } from "@/lib/hentai";

interface Props {
  slug: string;
}

// slug to episodes cache
interface EpCacheEntry {
  episodes: HentaiDetail["episodes"];
  url: string;
  time: number;
}
const epCache = new Map<string, EpCacheEntry>();
const EP_CACHE_TTL = 30 * 60 * 1000;

export function HentaiPageClient({ slug }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const itemName = searchParams.get("n");

  const [meta, setMeta] = useState<{
    name: string;
    poster: string | null;
    synopsis: string;
    genres: string[];
    studio: string;
    year: number | null;
    rating: number | null;
  } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState(false);

  const [episodes, setEpisodes] = useState<HentaiDetail["episodes"]>([]);
  const [epUrl, setEpUrl] = useState("");
  const [epLoading, setEpLoading] = useState(true);
  const [epError, setEpError] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [mp4, setMp4] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    setMetaLoading(true);
    setMetaError(false);
    setEpLoading(true);
    setEpError(false);
    setMeta(null);
    setEpisodes([]);
    setPlaying(false);

    if (itemName) {
      fetch(`/api/hentai/detail/meta?name=${encodeURIComponent(itemName)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok && d.detail) setMeta(d.detail);
          else setMetaError(true);
        })
        .catch(() => setMetaError(true))
        .finally(() => setMetaLoading(false));
    } else {
      setMetaError(true);
      setMetaLoading(false);
    }

    const cached = epCache.get(slug);
    if (cached && Date.now() - cached.time < EP_CACHE_TTL) {
      setEpisodes(cached.episodes);
      setEpUrl(cached.url);
      setEpLoading(false);
    } else {
      fetch(`/api/hentai/detail?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok && d.detail) {
            setEpisodes(d.detail.episodes);
            setEpUrl(d.detail.url);
            epCache.set(slug, {
              episodes: d.detail.episodes,
              url: d.detail.url,
              time: Date.now(),
            });
          } else setEpError(true);
        })
        .catch(() => setEpError(true))
        .finally(() => setEpLoading(false));
    }
  }, [slug, itemName]);

  const handlePlay = async (tvUrl: string) => {
    setPlaying(true);
    setBusy(true);
    setStreamError(false);
    setMp4("");
    try {
      const r = await fetch(`/api/hentai/resolve?tv=${encodeURIComponent(tvUrl)}`);
      const d = await r.json();
      if (d?.ok && d.mp4) setMp4(d.mp4);
      else setStreamError(true);
    } catch {
      setStreamError(true);
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    if (playing) { setPlaying(false); return; }
    markRestoreIntent();
    if (window.history.length > 1) router.back();
    else router.push(`/${locale}/category/hentai`, { scroll: false });
  };

  const displayName = meta?.name || slug.replace(/-/g, " ");
  const displayPoster = meta?.poster || null;
  const displaySynopsis = meta?.synopsis || "";
  const displayGenres = meta?.genres || [];
  const displayStudio = meta?.studio || "";
  const displayYear = meta?.year || null;
  const displayRating = meta?.rating || null;
  const single = episodes.length <= 1;

  if (metaLoading && epLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-5xl mx-auto px-4 pt-28">
          <div className="flex gap-6 animate-pulse">
            <div className="w-24 sm:w-36 md:w-44 aspect-[2/3] rounded-lg bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-3 pt-4">
              <div className="h-8 w-3/4 bg-muted rounded" />
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-4 w-1/2 bg-muted rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (metaError && epError) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Not found</p>
            <Button onClick={() => router.push(`/${locale}/category/hentai`)}>
              {t("content.goBack")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (playing) {
    return (
      <div className="min-h-screen bg-background">
        <div className="min-h-screen flex flex-col px-4 pt-20 pb-8">
          <div className="max-w-6xl mx-auto w-full">
            <button
              onClick={handleBack}
              className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> {t("content.goBack")}
            </button>
            <div className="rounded-xl overflow-hidden shadow-2xl border border-border bg-black aspect-video flex items-center justify-center">
              {busy && <Loader2 className="w-8 h-8 animate-spin text-pink-500" />}
              {!busy && mp4 && (
                <video key={mp4} src={mp4} controls autoPlay playsInline controlsList="nodownload noremoteplayback noplaybackrate" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} className="w-full h-full bg-black" />
              )}
              {!busy && streamError && (
                <p className="text-muted-foreground text-sm">Stream not available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pb-24">
        <div className="relative w-full">
          <div className="relative w-full h-[32vh] min-h-[200px] sm:h-[40vh] md:h-[55vh] overflow-hidden">
            {displayPoster ? (
              <img
                src={displayPoster}
                alt={displayName}
                className="w-full h-full object-cover object-top scale-150 blur-2xl opacity-60"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-900/40 to-muted" />
            )}
            <div className="detail-backdrop-fade absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>
          <Button
            onClick={handleBack}
            variant="secondary"
            size="sm"
            className="back-btn absolute top-3 left-3 z-30 gap-1.5 bg-background/60 backdrop-blur-sm hover:bg-background/80 md:top-28 md:left-6 h-9 md:h-11 px-3 md:px-5 text-sm md:text-base"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
            {t("content.goBack")}
          </Button>
        </div>

        <div className="detail-info max-w-5xl mx-auto px-4 sm:px-6 relative z-10 -mt-24">
          <div className="flex gap-4 sm:gap-6 mb-6">
            {displayPoster && (
              <img
                src={displayPoster}
                alt={displayName}
                className="detail-poster w-24 sm:w-36 md:w-44 rounded-lg shadow-2xl border-2 border-card flex-shrink-0 self-start mt-12 sm:mt-16"
              />
            )}

            <div className="flex-1 min-w-0 pt-12 sm:pt-16">
              <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2 leading-tight">
                {displayName}
              </h1>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                {displayRating != null && displayRating > 0 && (
                  <span className="flex items-center gap-1 text-primary">
                    <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                    {displayRating.toFixed(1)}
                  </span>
                )}
                {displayYear && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    {displayYear}
                  </span>
                )}
                {displayStudio && <span>{displayStudio}</span>}
              </div>

              {displayGenres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {displayGenres.map((g) => (
                    <span
                      key={g}
                      className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 sm:py-1 rounded-md"
                    >
                      {genreLabel(g)}
                    </span>
                  ))}
                </div>
              )}

              {single && !epLoading && (
                <Button onClick={() => handlePlay(epUrl)} className="gap-1.5 sm:gap-2">
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                  {t("content.play")}
                </Button>
              )}
              {single && epLoading && (
                <Button disabled className="gap-1.5 sm:gap-2 opacity-60">
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  {t("hentai.resolving")}
                </Button>
              )}
            </div>
          </div>

          {displaySynopsis && (
            <div className="mb-8 max-w-2xl">
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                {t("content.overview")}
              </h2>
              <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
                {displaySynopsis}
              </p>
            </div>
          )}

          {!single && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3">
                {t("content.episodes")}
              </h2>
              {epLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("hentai.resolving")}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {episodes.map((ep) => (
                    <button
                      key={ep.url}
                      onClick={() => handlePlay(ep.url)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors text-sm font-medium"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      {ep.n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
