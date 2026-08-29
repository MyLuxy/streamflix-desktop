import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ContentCard } from "./ContentCard";
import { useLocale } from "@/hooks/useLocale";
import { hrefForItem } from "@/lib/links";
import { Movie, TVShow, MediaItem } from "@/lib/types";

interface ContentRowProps {
  title: string;
  items: (Movie | TVShow | MediaItem)[];
  onItemClick?: (item: Movie | TVShow | MediaItem) => void;
  isLoading?: boolean;
  /** Se presente, mostra una card "Vedi tutto" in coda che porta a questo href. */
  seeMoreHref?: string;
  /** Se true, resetta lo scroll orizzontale a ogni montaggio (es. consigliati). */
  resetScroll?: boolean;
}

export function ContentRow({
  title,
  items,
  onItemClick,
  isLoading,
  seeMoreHref,
  resetScroll,
}: ContentRowProps) {
  const locale = useLocale();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Chiave stabile per memorizzare lo scroll orizzontale della riga, così
  // tornando indietro la riga resta nella stessa posizione (stessi titoli).
  const storageKey = `rowscroll:${seeMoreHref || title}`;

  // Ripristina lo scroll orizzontale salvato al montaggio, in modo ISTANTANEO
  // (disabilita temporaneamente scroll-smooth per evitare l'animazione).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (resetScroll) {
      try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
      checkScroll();
      return;
    }
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const prev = el.style.scrollBehavior;
        el.style.scrollBehavior = "auto";
        el.scrollLeft = Number(saved);
        el.style.scrollBehavior = prev;
      }
    } catch { /* ignore */ }
    checkScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, resetScroll]);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
      try {
        sessionStorage.setItem(storageKey, String(scrollLeft));
      } catch { /* ignore */ }
    }
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.75;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const getTitle = (item: Movie | TVShow | MediaItem) => {
    return "title" in item ? item.title : item.name;
  };

  const getYear = (item: Movie | TVShow | MediaItem) => {
    const date = "release_date" in item ? item.release_date : (item as TVShow).first_air_date;
    return date ? new Date(date).getFullYear().toString() : undefined;
  };

  const getMediaType = (item: Movie | TVShow | MediaItem): "movie" | "tv" => {
    if ("media_type" in item && item.media_type) return item.media_type;
    return "title" in item ? "movie" : "tv";
  };

  if (isLoading) {
    return (
      <div className="py-4">
        <div className="h-7 w-48 bg-muted rounded-md animate-pulse mb-4 ml-6 md:ml-10" />
        <div className="flex gap-3 px-6 md:px-10 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[160px] sm:w-[180px] md:w-[220px] aspect-[2/3] bg-muted rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="py-4 group/row"
    >
      <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 px-6 md:px-10 hover:text-secondary-foreground transition-colors duration-200 cursor-default select-none">
        {title}
      </h2>

      <div className="relative">
        {/* Scroll buttons: fascia rettangolare a tutta altezza con sfumatura, non un cerchietto
            piccolo - bersaglio molto più facile da colpire senza cliccare per sbaglio una card
            adiacente durante lo scorrimento */}
        <button
          onClick={() => scroll("left")}
          className={`absolute inset-y-0 left-0 z-10 w-16 md:w-28 flex items-center justify-start pl-3 md:pl-6 bg-gradient-to-r from-background/95 via-background/60 to-transparent transition-opacity duration-300 ${
            canScrollLeft
              ? "opacity-0 group-hover/row:opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-12 h-12 md:w-16 md:h-16 -translate-x-px" />
        </button>

        <button
          onClick={() => scroll("right")}
          className={`absolute inset-y-0 right-0 z-10 w-16 md:w-28 flex items-center justify-end pr-3 md:pr-6 bg-gradient-to-l from-background/95 via-background/60 to-transparent transition-opacity duration-300 ${
            canScrollRight
              ? "opacity-0 group-hover/row:opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll right"
        >
          <ChevronRight className="w-12 h-12 md:w-16 md:h-16 translate-x-px" />
        </button>

        {/* Content scroll area */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-3 px-6 md:px-10 overflow-x-auto scrollbar-hide scroll-smooth"
        >
          {items.map((item) => (
            <ContentCard
              key={`${getMediaType(item)}-${item.id}`}
              posterPath={item.poster_path}
              title={getTitle(item)}
              rating={item.vote_average}
              year={getYear(item)}
              href={hrefForItem(locale, item)}
            />
          ))}

          {/* Card "Vedi tutto" in coda */}
          {seeMoreHref && (
            <Link
              href={seeMoreHref}
              className="group/more flex-shrink-0 w-[160px] sm:w-[180px] md:w-[220px] rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="relative aspect-[2/3] rounded-lg bg-secondary/60 border border-border/60 flex flex-col items-center justify-center gap-3 transition-all duration-300 group-hover/more:bg-secondary group-hover/more:border-primary/50">
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center transition-transform duration-300 group-hover/more:scale-110 group-hover/more:bg-primary/25">
                  <ArrowRight className="w-6 h-6 text-primary transition-transform duration-300 group-hover/more:translate-x-0.5" />
                </div>
                <span className="text-sm font-semibold text-foreground px-3 text-center">
                  {t("category.seeAll")}
                </span>
              </div>
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}
