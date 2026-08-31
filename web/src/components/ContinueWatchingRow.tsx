import { Play, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { IMAGE_SIZES, imageUrl as resolveImageUrl } from "@/lib/constants";
import type { WatchedItem } from "@/hooks/useContinueWatching";
import { useTranslation } from "react-i18next";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";
import { useArtworkFallback } from "@/hooks/useArtworkFallback";

interface ContinueWatchingRowProps {
  items: WatchedItem[];
  onItemClick: (item: WatchedItem) => void;
}

const STORAGE_KEY = "rowscroll:continue-watching";

export function ContinueWatchingRow({
  items,
  onItemClick,
}: ContinueWatchingRowProps) {
  const { t } = useTranslation();
  const { removeItem } = useContinueWatching();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // instant scroll restore on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const prev = el.style.scrollBehavior;
        el.style.scrollBehavior = "auto";
        el.scrollLeft = Number(saved);
        el.style.scrollBehavior = prev;
      }
    } catch { /* ignore */ }
    checkScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) return null;

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
      try {
        sessionStorage.setItem(STORAGE_KEY, String(scrollLeft));
      } catch { /* ignore */ }
    }
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = scrollRef.current.clientWidth * 0.75;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -amount : amount,
        behavior: "smooth",
      });
    }
  };

  const handleRemove = (e: React.MouseEvent, item: WatchedItem) => {
    e.stopPropagation();
    removeItem(item.provider, item.realId, item.mediaType);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="py-4 group/row"
    >
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4 px-6 md:px-10 select-none">
        {t("home.continueWatching")}
      </h2>

      <div className="relative">
        <button
          onClick={() => scroll("left")}
          className={`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm p-3 rounded-full shadow-lg transition-all duration-300 hover:bg-background/90 hover:scale-110 ${
            canScrollLeft
              ? "opacity-0 group-hover/row:opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>

        <button
          onClick={() => scroll("right")}
          className={`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm p-3 rounded-full shadow-lg transition-all duration-300 hover:bg-background/90 hover:scale-110 ${
            canScrollRight
              ? "opacity-0 group-hover/row:opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll right"
        >
          <ChevronRight className="w-7 h-7" />
        </button>

        {/* wheel events pass through this so page scroll still works, cards below opt back in */}
        <div className="pointer-events-none">
          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth px-6 md:px-10"
          >
            {items.map((item) => (
              <ContinueWatchingCard
                key={`${item.provider}-${item.mediaType}-${item.realId}`}
                item={item}
                onItemClick={onItemClick}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface ContinueWatchingCardProps {
  item: WatchedItem;
  onItemClick: (item: WatchedItem) => void;
  onRemove: (e: React.MouseEvent, item: WatchedItem) => void;
}

// own component so useArtworkFallback (a hook) can run per item, not inside the row's .map()
function ContinueWatchingCard({ item, onItemClick, onRemove }: ContinueWatchingCardProps) {
  const { fallbackBackdrop, fallbackPoster, triggerFallback } = useArtworkFallback(
    item.title, undefined, item.mediaType, item.provider
  );
  const nativeUrl =
    resolveImageUrl(item.backdropPath, IMAGE_SIZES.backdrop.medium) ??
    resolveImageUrl(item.posterPath, IMAGE_SIZES.poster.medium);
  const imageUrl = fallbackBackdrop ?? fallbackPoster ?? nativeUrl;

  return (
    <div
      className="flex-shrink-0 w-72 md:w-[360px] pointer-events-auto cursor-pointer group/card"
      onClick={() => onItemClick(item)}
    >
      <div className="relative aspect-video rounded-lg overflow-hidden bg-muted shadow-card">
        {imageUrl ? (
          <ImageWithSpinner
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={triggerFallback}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-muted flex items-center justify-center">
            <span className="text-6xl">🎬</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {(item.progress ?? 0) > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 z-10">
            <div
              className="h-full bg-primary"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
        {item.currentTime !== undefined && item.duration && item.duration > 0 && (
          <div className="absolute bottom-2 right-2 z-10 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            {Math.floor(item.currentTime / 60)}:{String(Math.floor(item.currentTime % 60)).padStart(2, "0")} / {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, "0")}
          </div>
        )}

        {item.mediaType === "tv" && item.season !== undefined && item.episode !== undefined && (
          <div className="absolute top-2 left-2 z-20 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
            S{item.season} E{item.episode}
          </div>
        )}

        <div
          onClick={(e) => onRemove(e, item)}
          className="absolute top-2 right-2 z-20 w-9 h-9 rounded-full bg-black/70 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity"
        >
          <X className="w-5 h-5 text-white" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-5 h-5 text-primary-foreground fill-current ml-0.5" />
          </div>
        </div>

        <div className="absolute bottom-2 left-3 right-3">
          <p className="text-sm font-medium text-white truncate">
            {item.title}
          </p>
        </div>
      </div>
    </div>
  );
}
