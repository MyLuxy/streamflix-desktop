"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { Play, Info, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/hooks/useLocale";
import { useTranslation } from "react-i18next";
import { useHeroEntrance } from "@/hooks/useHeroEntrance";
import { markRestoreIntent } from "@/lib/scroll-history";
import { popPreviousPath } from "@/lib/nav-history";
import { IMAGE_SIZES, GENRES, imageUrl } from "@/lib/constants";
import { hrefForItem } from "@/lib/links";
import type { Movie, TVShow } from "@/lib/types";

interface HorrorHeroProps {
  rows: { key: string; items: (Movie & TVShow)[] }[];
  titleKey: string;
  taglineKey: string;
}

const AUTOPLAY_MS = 14000;

export function HorrorHero({ rows, titleKey, taglineKey }: HorrorHeroProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();

  // Primi 5 film della riga trending
  const featured = useMemo(
    () => (rows[0]?.items ?? []).slice(0, 5) as (Movie & TVShow)[],
    [rows]
  );
  const [index, setIndex] = useState(0);
  const current = featured[index];
  // Ingresso hero: sfondo neutro finché il backdrop non è caricato, poi rivela.
  const [imgLoaded, setImgLoaded] = useState(false);
  const { revealed, instant } = useHeroEntrance(imgLoaded);

  // Autoplay carosello. index tra le dipendenze: ad ogni cambio (anche manuale
  // via pallini) il timer si azzera, così lo slide successivo parte da capo.
  useEffect(() => {
    if (featured.length <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % featured.length),
      AUTOPLAY_MS
    );
    return () => clearInterval(id);
  }, [featured.length, index]);

  // ── 3D parallasse MOLTO lento ──
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 70, damping: 20, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 70, damping: 20, mass: 0.6 });
  const posterRotateY = useTransform(sx, [-0.5, 0.5], [-18, 18]);
  const posterRotateX = useTransform(sy, [-0.5, 0.5], [14, -14]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (e.type === "touchmove") return;
      const rect = e.currentTarget.getBoundingClientRect();
      mx.set((e.clientX - rect.left) / rect.width - 0.5);
      my.set((e.clientY - rect.top) / rect.height - 0.5);
    },
    [mx, my]
  );
  const handleMouseLeave = useCallback(() => {
    mx.set(0);
    my.set(0);
  }, [mx, my]);

  const handleBack = () => {
    markRestoreIntent();
    const prev = popPreviousPath();
    if (prev) router.push(prev, { scroll: false });
    else router.push(`/${locale}`, { scroll: false });
  };

  if (!current) return null;

  const title =
    "title" in current ? current.title : (current as TVShow).name;
  const date =
    "release_date" in current
      ? current.release_date
      : (current as TVShow).first_air_date;
  const year = date ? new Date(date).getFullYear() : null;
  const genres = (current.genre_ids ?? [])
    .map((id) => GENRES[id])
    .filter(Boolean)
    .slice(0, 3);
  const mediaType = "title" in current ? "movie" : "tv";
  const backdropUrl = imageUrl(current.backdrop_path, IMAGE_SIZES.backdrop.original);
  const posterUrl = imageUrl(current.poster_path, IMAGE_SIZES.poster.large);
  const playHref = `${hrefForItem(locale, current)}?watch=1`;
  const infoHref = hrefForItem(locale, current);

  return (
    <section className={`horror-hero relative w-full h-[80vh] min-h-[520px] md:h-[90vh] overflow-hidden bg-black select-none ${revealed ? "opacity-100" : "opacity-0"} ${instant ? "" : "transition-opacity duration-700 ease-out"}`}>
      {/* ===== GRANA + NEBBIA + VIGNETTA ===== */}
      <div className="horror-grain" />
      <div className="horror-fog" />
      <div className="horror-vignette" />

      {/* ===== BACKDROP (sfondo corrente) ===== */}
      <AnimatePresence mode="popLayout" initial={!instant}>
        {backdropUrl && (
          <motion.img
            key={current.id}
            src={backdropUrl}
            alt=""
            onLoad={() => setImgLoaded(true)}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute inset-0 w-full h-full object-cover opacity-25 md:opacity-35"
          />
        )}
      </AnimatePresence>

      {/* Overlay scuri */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/75 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 45%, transparent 68%)' }} />

      {/* ===== TASTO INDIETRO ===== */}
      <button
        onClick={handleBack}
        className="back-btn absolute top-3 left-3 z-40 md:top-28 md:left-6 h-9 md:h-11 px-3 md:px-5 text-sm md:text-base gap-1.5 bg-background/60 backdrop-blur-sm hover:bg-background/80 rounded-lg inline-flex items-center"
      >
        <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
        <span className="hidden md:inline">{t("content.goBack")}</span>
      </button>

      {/* ===== CONTENUTO PRINCIPALE ===== */}
      <div className="relative z-20 h-full max-w-7xl mx-auto px-6 md:px-10 flex items-center">
        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6 md:gap-12 items-end md:items-center w-full">
          {/* ── TESTO (TITOLO + DESCRIZIONE FILM CORRENTE) ── */}
          <div className="pb-12 md:pb-0">
            {/* Titolo categoria "HORROR" con sangue che sgorga */}
            <AnimatePresence mode="wait" initial={!instant}>
              <motion.div
                key="title"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.25, ease: "easeOut" }}
                className="mb-5 flex justify-start"
              >
                <img
                  src="/horror/horror.png"
                  alt="horror"
                  draggable={false}
                  className="max-w-[200px] md:max-w-[260px] lg:max-w-xs h-auto select-none pointer-events-none"
                />
              </motion.div>
            </AnimatePresence>

            {/* Info film corrente (cambia ad ogni slide) */}
            <AnimatePresence mode="wait" initial={!instant}>
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.45 }}
              >
                {genres.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {genres.map((g) => (
                      <span
                        key={g}
                        className="text-[11px] font-medium text-red-300/70 border border-red-900/30 px-2.5 py-0.5 rounded-full"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2 leading-tight">
                  {title}
                </h2>

                {year && (
                  <span className="text-sm text-white/40 font-mono">
                    {year}
                  </span>
                )}

                <p className="text-sm md:text-base text-white/55 mt-3 line-clamp-3 max-w-lg leading-relaxed">
                  {current.overview}
                </p>

                <div className="flex items-center gap-3 mt-5">
                  <Link
                    href={playHref}
                    className="inline-flex items-center gap-2 bg-red-900/40 hover:bg-red-800/50 text-red-300 hover:text-red-200 font-bold text-sm md:text-base px-6 md:px-8 py-2.5 md:py-3 rounded-full border border-red-800/25 transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {t("content.play")}
                  </Link>

                  <Link
                    href={infoHref}
                    className="inline-flex items-center gap-2 bg-black/40 hover:bg-black/60 text-white/60 hover:text-white/80 text-sm md:text-base px-5 md:px-7 py-2.5 md:py-3 rounded-full border border-white/10 transition-colors"
                  >
                    <Info className="w-4 h-4" />
                    {t("content.info")}
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── LOCANDINA 3D ── */}
          <motion.div
            key={current.id}
            initial={instant ? false : { opacity: 0, scale: 0.85, rotateY: 10 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 0.35, delay: 0.15, ease: "easeOut" }}
            className="hidden md:flex justify-center md:justify-end pb-16 lg:pb-0"
            style={{ perspective: "1100px" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {posterUrl && (
              <motion.div
                style={{
                  rotateX: posterRotateX,
                  rotateY: posterRotateY,
                  transformStyle: "preserve-3d",
                }}
              >
                <div className="relative">
                  <img
                    src={posterUrl}
                    alt={title}
                    draggable={false}
                    className="relative z-10 w-64 sm:w-72 md:w-80 lg:w-[28rem] rounded-2xl border border-red-900/20 select-none pointer-events-none"
                  />
                  <div className="absolute -inset-6 bg-gradient-to-br from-red-900/15 via-transparent to-red-950/20 rounded-3xl blur-3xl -z-10" />
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ===== PALLINI CAROSELLO ===== */}
      {featured.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`transition-all duration-300 rounded-full ${
                i === index
                  ? "w-7 h-1.5 bg-red-600"
                  : "w-2 h-1.5 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
