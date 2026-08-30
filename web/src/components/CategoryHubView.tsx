"use client";

import { useMemo, useState, useEffect, Fragment } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Flame } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/Navigation";
import { ContentRow } from "@/components/ContentRow";
import { ParallaxHero } from "@/components/ParallaxHero";
import { HorrorHero } from "@/components/HorrorHero";
import { useLocale } from "@/hooks/useLocale";
import { useTranslation } from "react-i18next";
import { useHeroEntrance } from "@/hooks/useHeroEntrance";
import { markRestoreIntent } from "@/lib/scroll-history";
import { popPreviousPath } from "@/lib/nav-history";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import type { Movie, TVShow } from "@/lib/types";

interface HubRow {
  key: string;
  titleKey: string;
  mediaType: "movie" | "tv";
  items: (Movie & TVShow)[];
}

interface CategoryHubViewProps {
  rows: HubRow[];
  titleKey: string;
  taglineKey: string;
  showAdultBanner?: boolean;
  heroVariant?: "grid" | "parallax" | "horror";
}

const NUM_COLUMNS = 7;

export function CategoryHubView({
  rows,
  titleKey,
  taglineKey,
  showAdultBanner = false,
  heroVariant = "grid",
}: CategoryHubViewProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { revealed: heroRevealed, instant: heroInstant } = useHeroEntrance();

  // only show glitch curtain on first visit, not coming back from a film
  const [showHorrorCurtain] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem("horror-entrance")) return false;
      sessionStorage.setItem("horror-entrance", "1");
      return true;
    } catch {
      return false;
    }
  });

  // capped at 70 posters so column height matches other category pages
  const columns = useMemo(() => {
    const seen = new Set<number>();
    const posters: string[] = [];
    rows.forEach((row) =>
      row.items.forEach((i) => {
        if (i.poster_path && !seen.has(i.id)) {
          seen.add(i.id);
          posters.push(imageUrl(i.poster_path, IMAGE_SIZES.poster.medium)!);
        }
      })
    );
    const pool = posters.slice(0, 70);
    const cols: string[][] = Array.from({ length: NUM_COLUMNS }, () => []);
    pool.forEach((url, idx) => cols[idx % NUM_COLUMNS].push(url));
    return cols.map((col) => {
      let filled = col;
      while (filled.length < 6 && col.length > 0) filled = [...filled, ...col];
      return filled;
    });
  }, [rows]);

  // random pick after mount, avoids ssr/client mismatch
  const [bannerImg, setBannerImg] = useState("/hentai2.png");
  const [bannerLoaded, setBannerLoaded] = useState(false);
  useEffect(() => {
    setBannerImg(Math.random() < 0.5 ? "/hentai.jpg" : "/hentai2.png");
  }, []);
  // onLoad doesnt fire for a cached img, gotta check .complete too
  useEffect(() => {
    setBannerLoaded(false);
    const img = new window.Image();
    img.src = bannerImg;
    if (img.complete) setBannerLoaded(true);
    else img.onload = () => setBannerLoaded(true);
  }, [bannerImg]);

  const handleBack = () => {
    markRestoreIntent();
    // custom nav stack avoids a category/film back loop
    const prev = popPreviousPath();
    if (prev) router.push(prev, { scroll: false });
    else router.push(`/${locale}`, { scroll: false });
  };

  const featured = useMemo(() => {
    const trendingRow = rows.find((r) => r.key === "trending") ?? rows[0];
    return trendingRow?.items ?? [];
  }, [rows]);

  return (
    <div className={`min-h-screen overflow-x-clip ${heroVariant === "horror" ? "bg-[#000000] horror-page" : "bg-background"}`}>
      {heroVariant === "horror" && showHorrorCurtain && <div className="horror-curtain-full" />}
      <Navigation />

      <main className="pb-24">
        <div className="relative">
          {/* horror hero has its own back button */}
          {heroVariant !== "horror" && (
            <Button
              onClick={handleBack}
              variant="secondary"
              size="sm"
              className="back-btn absolute top-3 left-3 z-30 md:top-28 md:left-6 h-9 md:h-11 px-3 md:px-5 text-sm md:text-base md:[&_svg]:size-5 gap-1.5 bg-background/60 backdrop-blur-sm hover:bg-background/80"
            >
              <ArrowLeft />
              {t("content.goBack")}
            </Button>
          )}

          {heroVariant === "parallax" ? (
            <ParallaxHero items={featured} mediaType={rows[0]?.mediaType ?? "tv"} />
          ) : heroVariant === "horror" ? (
            <HorrorHero rows={rows} titleKey={titleKey} taglineKey={taglineKey} />
          ) : (
            <section
              className={`hero-grid relative w-full h-[56vh] min-h-[380px] md:h-[68vh] overflow-hidden bg-background ${heroRevealed ? "opacity-100" : "opacity-0"} ${heroInstant ? "" : "transition-opacity duration-700 ease-out"}`}
            >
              <div className="hero-grid-tilt absolute inset-0 flex justify-center gap-2 md:gap-3">
                {columns.map((col, i) => (
                  <div key={i} className="hero-col w-[90px] sm:w-[120px] md:w-[150px] flex-shrink-0 overflow-hidden">
                    <div
                      className={`hero-col-track ${i % 2 === 0 ? "hero-up" : "hero-down"}`}
                      style={{ animationDuration: `${90 + (i % 4) * 16}s` }}
                    >
                      {[...col, ...col].map((url, j) => (
                        <img
                          key={j}
                          src={url}
                          alt=""
                          loading="lazy"
                          className="w-full aspect-[2/3] object-cover rounded-lg mb-2 md:mb-3"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hero-grid-dim absolute inset-0 bg-black/55" />
              <div className="hero-grid-blend absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
              <div className="hero-grid-topdim absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 z-10 select-none">
                <motion.div
                  initial={heroInstant ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  <h1 className="hero-grid-title text-5xl md:text-7xl lg:text-8xl font-extrabold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] leading-none">
                    {t(titleKey)}
                  </h1>
                  <p className="hero-grid-tagline text-base md:text-xl text-white/80 mt-4 italic font-light">
                    {t(taglineKey)}
                  </p>
                </motion.div>
              </div>
            </section>
          )}
        </div>

        {/* hides the column-edge flicker on scroll */}
        {heroVariant === "grid" && (
          <div aria-hidden className="relative z-20 -mt-5 h-5 bg-background" />
        )}

        <div className={`relative z-10 mt-6 space-y-6 md:space-y-8 ${heroVariant === "horror" ? "horror-catalog" : ""}`}>
          {rows.map((row, i) => (
            <Fragment key={row.key}>
              <ContentRow title={t(row.titleKey)} items={row.items} />
              {heroVariant === "horror" && (
                <div className="relative -mx-4 md:-mx-8 h-14 md:h-16 overflow-hidden">
                  {i === 1 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <img src="/horror/200w.gif" alt="" className="h-[140%] w-auto" loading="lazy" />
                    </div>
                  )}
                  {i === 3 && (
                    <div className="absolute inset-0 flex items-center justify-start pl-8 md:pl-12">
                      <img src="/horror/h1.jpg" alt="" className="h-full w-auto max-w-none opacity-70" loading="lazy" />
                    </div>
                  )}
                  {i === 6 && (
                    <div className="absolute inset-0 flex items-center justify-end pr-8 md:pr-12">
                      <img src="/horror/h2.webp" alt="" className="h-full w-auto max-w-none opacity-90" loading="lazy" />
                    </div>
                  )}
                </div>
              )}
              {showAdultBanner && row.key === "seinen" && (
                <div className="px-4 md:px-8 py-4">
                  <Link
                    href={`/${locale}/category/hentai`}
                    className="group relative block w-full max-w-3xl mx-auto overflow-hidden rounded-2xl h-36 sm:h-44 md:h-48 shadow-xl bg-black transition-shadow duration-300 hover:shadow-2xl"
                  >
                    {!bannerLoaded && (
                      <div className="absolute inset-0 shimmer-wave bg-gradient-to-br from-pink-900/40 via-purple-900/30 to-black" />
                    )}

                    <img
                      src={bannerImg}
                      alt=""
                      onLoad={() => setBannerLoaded(true)}
                      className={`absolute inset-0 h-full w-full object-cover object-left transition-all duration-700 ease-out group-hover:scale-[1.03] ${
                        bannerLoaded
                          ? "opacity-100 blur-0 scale-100"
                          : "opacity-0 blur-md scale-110"
                      }`}
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                    <div className="relative h-full flex flex-col justify-end pb-4 gap-2 md:gap-3 px-5 md:px-7 max-w-[70%]">
                      <h3 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] leading-tight">
                        {t("anime.adultTitle")}
                      </h3>
                      <span className="inline-flex items-center gap-1.5 md:gap-2 self-start bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs sm:text-sm md:text-base px-4 md:px-6 py-2 md:py-2.5 rounded-full shadow-lg transition-colors">
                        <Flame className="w-4 h-4 md:w-5 md:h-5" />
                        {t("anime.adultCta")}
                      </span>
                    </div>
                  </Link>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </main>
    </div>
  );
}
