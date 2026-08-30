"use client";

import Link from "next/link";
import { useLocale } from "@/hooks/useLocale";
import { useTranslation } from "react-i18next";
import { Flame, MonitorPlay, Sparkles, Wand2, Skull, VenetianMask } from "lucide-react";

interface CategoryLink {
  slug: string;
  labelKey: string;
  bg: string;
  icon: React.ReactNode;
  iconClass?: string;
}

const ICON_CLS = "w-full h-full";

const Icons = {
  trend: <Flame className={ICON_CLS} strokeWidth={1.8} />,
  tv: <MonitorPlay className={ICON_CLS} strokeWidth={1.8} />,
  anime: <Sparkles className={ICON_CLS} strokeWidth={1.8} />,
  animation: <Wand2 className={ICON_CLS} strokeWidth={1.8} />,
  horror: <Skull className={ICON_CLS} strokeWidth={1.8} />,
  thriller: <VenetianMask className={ICON_CLS} strokeWidth={1.8} />,
  // html circle scales cleaner than an svg icon here
  hentai: (
    <span className="flex items-center justify-center w-full h-full rounded-full border-[3px] border-current font-bold leading-none">
      <span className="text-2xl md:text-3xl tracking-tight">18+</span>
    </span>
  ),
};

const IMG = "https://image.tmdb.org/t/p/w780";

const CATEGORIES: CategoryLink[] = [
  {
    slug: "trending-movies",
    labelKey: "home.trendingMovies",
    bg: `${IMG}/xJHokMbljvjADYdit5fK5VQsXEG.jpg`, // Interstellar
    icon: Icons.trend,
  },
  {
    slug: "trending-tv",
    labelKey: "home.trendingTV",
    bg: `${IMG}/suopoADq0k8YZr4dQXcU6pToj6s.jpg`, // Game of Thrones
    icon: Icons.tv,
  },
  {
    slug: "anime",
    labelKey: "home.anime",
    bg: `${IMG}/oHqYrPAsIiTD5m4DuxumV4er8BU.jpg`, // Re:Zero (poster)
    icon: Icons.anime,
  },
  {
    slug: "hentai",
    labelKey: "hentai.title",
    bg: `${IMG}/vRlQeiTHdB49n8xeIipQIi40qZE.jpg`, // Muchuu no Tou (poster)
    icon: Icons.hentai,
  },
  {
    slug: "animation-movies",
    labelKey: "home.animationMovies",
    bg: `${IMG}/3Rfvhy1Nl6sSGJwyjb0QiZzZYlB.jpg`, // Toy Story
    icon: Icons.animation,
    iconClass: "scale-90",
  },
  {
    slug: "horror",
    labelKey: "home.horror",
    bg: `${IMG}/wVYREutTvI2tmxr6ujrHT704wGF.jpg`, // The Conjuring (poster)
    icon: Icons.horror,
  },
  {
    slug: "thriller",
    labelKey: "home.thriller",
    bg: `${IMG}/i5H7zusQGsysGQ8i6P361Vnr0n2.jpg`, // Se7en
    icon: Icons.thriller,
  },
];

export function CategoryButtons() {
  const locale = useLocale();
  const { t } = useTranslation();

  return (
    <section className="px-4 md:px-10 py-4">
      <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 px-2 select-none">
        {t("home.categories")}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 md:gap-4">
        {CATEGORIES.map((cat, i) => (
          <div
            key={cat.slug}
            className={`cat-pop ${cat.slug === "thriller" ? "hidden sm:block" : ""}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <Link
              href={`/${locale}/category/${cat.slug}`}
              aria-label={t(cat.labelKey)}
              className="
                cat-card group relative flex flex-col items-center justify-center
                aspect-[3/4] sm:aspect-square xl:aspect-[3/4]
                rounded-2xl overflow-hidden
                bg-muted
                shadow-lg shadow-black/30
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60
              "
            >
              <img
                src={cat.bg}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />

              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/30" />

              <span className={`relative text-white w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 mb-3 drop-shadow-lg ${cat.iconClass || ""}`}>
                {cat.icon}
              </span>

              <span className="relative text-white font-bold text-lg md:text-xl text-center px-2 leading-tight drop-shadow-md">
                {t(cat.labelKey)}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
