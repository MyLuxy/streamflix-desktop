import { useState, useEffect } from "react";
import { Play, Plus, Check, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MediaItem, Movie, TVShow } from "@/lib/types";
import { IMAGE_SIZES, GENRES, imageUrl } from "@/lib/constants";
import { useWatchlist } from "@/hooks/useWatchlist";
import { providerTagOf } from "@/lib/provider-tag";
import { useTranslation } from "react-i18next";
import { useHeroEntrance } from "@/hooks/useHeroEntrance";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";

interface HeroBannerProps {
  items: MediaItem[];
  onPlayClick: (item: MediaItem) => void;
  onInfoClick: (item: MediaItem) => void;
}

// scales down as title length grows so it doesnt overflow
function titleSizeClass(title: string): string {
  if (title.length > 34) return "text-xl md:text-3xl lg:text-4xl";
  if (title.length > 20) return "text-2xl md:text-4xl lg:text-5xl";
  return "text-4xl md:text-6xl lg:text-7xl";
}

// below this ratio the img is a poster used as fallback, not a real banner
const WIDE_BANNER_MIN_RATIO = 1.4;

export function HeroBanner({ items, onPlayClick, onInfoClick }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  // once a logo 404s just keep showing text instead
  const [failedLogoIds, setFailedLogoIds] = useState<Set<number>>(new Set());
  // defaults to wide so real banners dont flash a blur frame first
  const [isNarrowImage, setIsNarrowImage] = useState(false);
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const { t } = useTranslation();
  const { revealed, instant } = useHeroEntrance();

  const featuredItems = items.slice(0, 5);
  const currentItem = featuredItems[currentIndex];

  // resets to wide on slide change until the new img reports its real ratio
  useEffect(() => {
    setIsNarrowImage(false);
  }, [currentItem?.id]);

  // resets timer on manual dot click too
  useEffect(() => {
    if (featuredItems.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
    }, 8000);

    return () => clearInterval(timer);
  }, [featuredItems.length, currentIndex]);

  if (!currentItem) return null;

  const title = "title" in currentItem ? currentItem.title : currentItem.name;
  const backdropUrl = imageUrl(currentItem.backdrop_path, IMAGE_SIZES.backdrop.original);
  const handleBackdropLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setIsNarrowImage(img.naturalWidth / img.naturalHeight < WIDE_BANNER_MIN_RATIO);
    }
  };
  // only some providers (StreamingCommunity) expose a title logo
  const logoUrl = currentItem.logo_path && !failedLogoIds.has(currentItem.id)
    ? imageUrl(currentItem.logo_path, IMAGE_SIZES.backdrop.original)
    : null;

  const genres = currentItem.genre_ids
    ?.slice(0, 3)
    .map((id) => GENRES[id])
    .filter(Boolean);

  const mediaType = currentItem.media_type || ("title" in currentItem ? "movie" : "tv");
  const inWatchlist = isInWatchlist(currentItem.id, mediaType);

  return (
    <div className={`hero-banner relative w-full h-[54vh] md:h-[68vh] overflow-hidden ${revealed ? "opacity-100" : "opacity-0"} ${instant ? "" : "transition-opacity duration-700 ease-out"}`}>
      <AnimatePresence mode="wait" initial={!instant}>
        <motion.div
          key={currentItem.id}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          {backdropUrl ? (
            isNarrowImage ? (
              <>
                {/* narrow poster fallback, blurred fill behind the real image */}
                <img
                  src={backdropUrl}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-full object-cover object-top scale-110 blur-2xl opacity-70"
                />
                <ImageWithSpinner
                  src={backdropUrl}
                  alt={title}
                  onLoad={handleBackdropLoad}
                  spinnerClassName="w-8 h-8"
                  className="absolute inset-0 w-full h-full object-contain object-top"
                />
              </>
            ) : (
              <ImageWithSpinner
                src={backdropUrl}
                alt={title}
                onLoad={handleBackdropLoad}
                spinnerClassName="w-8 h-8"
                className="w-full h-full object-cover object-top"
              />
            )
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-background" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* less white fade in light theme so trending images dont wash out */}
      <div className="hero-fade-top absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="hero-fade-side absolute inset-0 bg-gradient-to-r from-background/80 via-background/20 to-transparent" />

      {/* pt not pb, leaves room before the next section */}
      <div className="absolute inset-0 flex items-center px-4 md:px-8 pt-40 md:pt-56">
        <AnimatePresence mode="wait" initial={!instant}>
          <motion.div
            key={currentItem.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            {genres && genres.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="text-xs font-medium text-white bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* uses the title logo when the provider has one */}
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={title}
                className="max-w-[70%] max-h-24 md:max-h-36 lg:max-h-40 w-auto object-contain object-left mb-4 drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
                onError={() => {
                  setFailedLogoIds((prev) => new Set(prev).add(currentItem.id));
                }}
              />
            ) : (
              <h1 className={`${titleSizeClass(title)} font-bold text-white mb-4 text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]`}>
                {title}
              </h1>
            )}

            <p className="text-base md:text-lg text-white/85 mb-6 line-clamp-2 md:line-clamp-3 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
              {currentItem.overview}
            </p>

            <div className="flex items-center gap-4">
              <Button
                onClick={() => onPlayClick(currentItem)}
                className="rounded-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2 shadow-glow h-12 md:h-14 px-8 md:px-10 text-base md:text-lg [&_svg]:size-6"
              >
                <Play className="fill-current" />
                {t('content.play')}
              </Button>

              <Button
                variant="secondary"
                onClick={() => onInfoClick(currentItem)}
                className="rounded-sm gap-2 h-12 md:h-14 px-8 md:px-10 text-base md:text-lg [&_svg]:size-6"
              >
                <Info />
                {t('content.info')}
              </Button>

              <Button
                variant="outline"
                onClick={() =>
                  toggleWatchlist({
                    id: currentItem.id,
                    mediaType,
                    title,
                    posterPath: currentItem.poster_path,
                    provider: providerTagOf(currentItem)?.provider,
                    realId: providerTagOf(currentItem)?.realId,
                  })
                }
                className="rounded-full w-12 h-12 md:w-14 md:h-14 border-foreground/30 hover:border-foreground p-0 [&_svg]:size-6"
              >
                {inWatchlist ? (
                  <Check />
                ) : (
                  <Plus />
                )}
              </Button>
            </div>

            {featuredItems.length > 1 && (
              <div className="flex items-center gap-2 mt-6">
                {featuredItems.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      index === currentIndex
                        ? "w-8 bg-primary"
                        : "w-4 bg-foreground/30 hover:bg-foreground/50"
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}