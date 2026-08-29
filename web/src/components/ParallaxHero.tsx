"use client";

import { useState, useCallback, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from "framer-motion";
import { Play } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/hooks/useLocale";
import { useTranslation } from "react-i18next";
import { useHeroEntrance } from "@/hooks/useHeroEntrance";
import { hrefForItem } from "@/lib/links";
import { IMAGE_SIZES, GENRES, imageUrl } from "@/lib/constants";
import type { Movie, TVShow } from "@/lib/types";

interface ParallaxHeroProps {
  items: (Movie & TVShow)[];
  mediaType: "movie" | "tv";
}

const AUTOPLAY_MS = 8000;

export function ParallaxHero({ items, mediaType }: ParallaxHeroProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  // Ingresso hero: sfondo neutro finché il backdrop non è caricato, poi rivela.
  const [imgLoaded, setImgLoaded] = useState(false);
  const { revealed, instant } = useHeroEntrance(imgLoaded);

  // Posizione del mouse SULLA CARD, normalizzata (-0.5 … 0.5). A riposo = 0.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 70, damping: 20, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 70, damping: 20, mass: 0.6 });

  // Tilt 3D che reagisce alla posizione del cursore sulla card (non traslazione).
  const cardRotateY = useTransform(sx, [-0.5, 0.5], [-22, 22]);
  const cardRotateX = useTransform(sy, [-0.5, 0.5], [16, -16]);

  // Ombra direzionale dinamica: si sposta in senso opposto al cursore (come
  // se la luce venisse dal puntatore) e si allunga col tilt della card.
  const shadowX = useTransform(sx, [-0.5, 0.5], [55, -55]);
  const shadowY = useTransform(sy, [-0.5, 0.5], [55, -55]);
  const cardShadow = useMotionTemplate`${shadowX}px ${shadowY}px 60px rgba(0,0,0,0.55)`;

  // Movimento del mouse calcolato rispetto alla CARD (passato sul wrapper card).
  const handleCardMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mx.set((e.clientX - rect.left) / rect.width - 0.5);
      my.set((e.clientY - rect.top) / rect.height - 0.5);
    },
    [mx, my]
  );
  const handleCardMouseLeave = useCallback(() => {
    mx.set(0);
    my.set(0);
  }, [mx, my]);

  const featured = items.filter((i) => i.backdrop_path && i.poster_path).slice(0, 6);
  const total = featured.length;

  // Auto-avanzamento del carosello. index tra le dipendenze: ad ogni cambio
  // (anche manuale via pallini) il timer si azzera e riparte da capo.
  useEffect(() => {
    if (total <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % total), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [total, index]);

  if (total === 0) return null;
  const current = featured[index];
  const title = current.name || current.title || "";
  const genres = (current.genre_ids ?? [])
    .map((id) => GENRES[id])
    .filter(Boolean)
    .slice(0, 2);
  const date = current.first_air_date || current.release_date;
  const year = date ? new Date(date).getFullYear() : null;
  const href = `${hrefForItem(locale, current)}?watch=${mediaType === "tv" ? "s1e1" : "1"}`;
  const backdrop = imageUrl(current.backdrop_path, IMAGE_SIZES.backdrop.original);
  const poster = imageUrl(current.poster_path, IMAGE_SIZES.poster.large);

  return (
    <section
      className={`relative w-full h-[78vh] min-h-[480px] md:h-[86vh] overflow-hidden bg-black ${revealed ? "opacity-100" : "opacity-0"} ${instant ? "" : "transition-opacity duration-700 ease-out"}`}
      style={{ perspective: "1300px" }}
    >
      {/* ===== Sfondo statico (wallpaper HD scurito) ===== */}
      <AnimatePresence mode="popLayout" initial={!instant}>
        <motion.img
          key={current.id}
          src={backdrop}
          alt=""
          onLoad={() => setImgLoaded(true)}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1.04 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </AnimatePresence>

      {/* Oscuramento (niente blur: lo sfondo resta nitido come la hero homepage) */}
      <div className="parallax-dim absolute inset-0 bg-black/40" />
      {/* Mobile: sfumatura dal basso (stile hero homepage). Desktop: da sinistra. */}
      <div className="parallax-fade absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent md:bg-gradient-to-r md:from-background md:via-background/70 md:to-transparent" />
      <div className="parallax-fade-top absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

      {/* ============ DESKTOP: testo a sx, card 3D a dx ============ */}
      <div className="relative z-10 h-full max-w-7xl mx-auto px-5 md:px-10 hidden md:flex items-center">
        <div className="grid grid-cols-[1.25fr_1fr] gap-10 items-center w-full">
          {/* Testo */}
          <AnimatePresence mode="wait" initial={!instant}>
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="max-w-xl"
            >
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-xs font-bold tracking-wider px-2.5 py-1 rounded bg-primary text-primary-foreground">
                  4K ULTRA HD
                </span>
                <span className="text-xs font-bold tracking-wider px-2.5 py-1 rounded bg-white/15 text-white backdrop-blur-sm">
                  {t("hub.trending").toUpperCase()}
                </span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-[1.05] drop-shadow-[0_3px_18px_rgba(0,0,0,0.7)]">
                {title}
              </h1>

              <div className="flex items-center gap-2 mt-3 text-base text-white/70">
                {year && <span>{year}</span>}
                {year && genres.length > 0 && <span className="opacity-50">•</span>}
                {genres.map((g, idx) => (
                  <span key={g}>
                    {g}
                    {idx < genres.length - 1 && <span className="opacity-50"> · </span>}
                  </span>
                ))}
              </div>

              <p className="mt-4 text-base text-white/80 line-clamp-4 max-w-lg leading-relaxed">
                {current.overview}
              </p>

              <Link
                href={href}
                className="group/cta mt-6 inline-flex items-center gap-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base px-9 py-3.5 rounded-full shadow-xl transition-all hover:scale-105"
              >
                <Play className="w-5 h-5 fill-current transition-transform group-hover/cta:scale-110" />
                {t("hero.playNow")}
              </Link>
            </motion.div>
          </AnimatePresence>

          {/* Card 3D: si inclina solo quando il cursore ci passa sopra */}
          <div
            className="flex justify-center"
            style={{ perspective: "1000px" }}
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
          >
            <AnimatePresence mode="wait" initial={!instant}>
              <motion.div
                key={current.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                style={{
                  rotateX: cardRotateX,
                  rotateY: cardRotateY,
                  transformStyle: "preserve-3d",
                  boxShadow: cardShadow,
                  borderRadius: "1rem",
                }}
              >
                <img
                  src={poster}
                  alt={title}
                  draggable={false}
                  className="w-80 lg:w-[26rem] rounded-2xl border border-white/10 select-none pointer-events-none"
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ============ MOBILE: hero stile homepage (testo in basso) ============ */}
      <div className="relative z-10 h-full flex md:hidden flex-col justify-end px-5 pb-16">
        <AnimatePresence mode="wait" initial={!instant}>
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.5 }}
            className="max-w-md"
          >
            {genres.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="text-xs font-medium text-white bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
            <h1 className="text-3xl font-bold text-white mb-3 text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
              {title}
            </h1>
            <p className="text-sm text-white/85 mb-5 line-clamp-3 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
              {current.overview}
            </p>
            <Link
              href={href}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-6 py-3 rounded-full shadow-lg"
            >
              <Play className="w-5 h-5 fill-current" />
              {t("hero.playNow")}
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ===== Indicatori carosello (niente frecce) ===== */}
      {total > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Vai al titolo ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-7 bg-primary" : "parallax-dot-idle w-2.5 bg-white/40 hover:bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
