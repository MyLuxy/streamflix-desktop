import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ContentCard } from "./ContentCard";
import { useLocale } from "@/hooks/useLocale";
import { hrefForItem } from "@/lib/links";
import { providerTagOf } from "@/lib/provider-tag";
import { Movie, TVShow, MediaItem } from "@/lib/types";

interface ContentRowProps {
  title: string;
  items: (Movie | TVShow | MediaItem)[];
  onItemClick?: (item: Movie | TVShow | MediaItem) => void;
  isLoading?: boolean;
  seeMoreHref?: string;
  resetScroll?: boolean;
  // live-tv channel logos read better as landscape thumbnails than movie/show posters
  isIptv?: boolean;
}

// reserves the card's exact footprint immediately (so scrollWidth/layout never shifts) but
// only mounts the real, animated card once it's within rootMargin of the scroll container -
// a home row with dozens of items otherwise pays the react+framer-motion cost for every
// single one up front, most of which the user may never scroll to. applies to every row/
// provider uniformly, current and future - no per-provider opt-in needed
function LazyCard({
  rootRef,
  isIptv,
  children,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  isIptv?: boolean;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const el = slotRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true);
      },
      { root, rootMargin: "0px 600px 0px 600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootRef]);

  return (
    <div
      ref={slotRef}
      className={
        isIptv
          ? "flex-shrink-0 w-[220px] sm:w-[260px] md:w-[300px]"
          : "flex-shrink-0 w-[160px] sm:w-[180px] md:w-[220px]"
      }
    >
      {visible ? children : null}
    </div>
  );
}

export function ContentRow({
  title,
  items,
  onItemClick,
  isLoading,
  seeMoreHref,
  resetScroll,
  isIptv,
}: ContentRowProps) {
  const locale = useLocale();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // stable key so back nav lands on the same scroll spot
  const storageKey = `rowscroll:${seeMoreHref || title}`;

  // instant restore, no smooth scroll animation on mount
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

  // a lazy-mounted card popping in changes scrollWidth well after the mount check above
  // ran - without this the arrow can get stuck on whatever it measured that first time
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => checkScroll());
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="h-8 w-52 bg-muted rounded-md animate-pulse mb-4 ml-6 md:ml-10" />
        <div className="flex gap-3 px-6 md:px-10 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={
                isIptv
                  ? "flex-shrink-0 w-[220px] sm:w-[260px] md:w-[300px] aspect-video bg-muted rounded-lg animate-pulse"
                  : "flex-shrink-0 w-[160px] sm:w-[180px] md:w-[220px] aspect-[2/3] bg-muted rounded-lg animate-pulse"
              }
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
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4 px-6 md:px-10 hover:text-secondary-foreground transition-colors duration-200 cursor-default select-none">
        {title}
      </h2>

      <div className="relative">
        {/* wide hit area so you dont misclick a card while scrolling */}
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

        {/* overflow-x-auto forces overflow-y to clip too, so py-12 gives the card shadows room (canceled by -my-12 so the row's height stays the same) */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-3 px-6 md:px-10 py-12 -my-12 overflow-x-auto scrollbar-hide scroll-smooth"
        >
          {items.map((item) => (
            <LazyCard key={`${getMediaType(item)}-${item.id}`} rootRef={scrollRef} isIptv={isIptv}>
              <ContentCard
                posterPath={item.poster_path}
                title={getTitle(item)}
                rating={item.vote_average}
                year={getYear(item)}
                href={hrefForItem(locale, item)}
                mediaType={getMediaType(item)}
                provider={providerTagOf(item)?.provider}
                orientation={isIptv ? "landscape" : "portrait"}
              />
            </LazyCard>
          ))}

          {seeMoreHref && (
            <Link
              href={seeMoreHref}
              className={
                isIptv
                  ? "group/more flex-shrink-0 w-[220px] sm:w-[260px] md:w-[300px] rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  : "group/more flex-shrink-0 w-[160px] sm:w-[180px] md:w-[220px] rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              }
            >
              <div className={`relative rounded-lg bg-secondary/60 border border-border/60 flex flex-col items-center justify-center gap-3 transition-all duration-300 group-hover/more:bg-secondary group-hover/more:border-primary/50 ${isIptv ? "aspect-video" : "aspect-[2/3]"}`}>
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
