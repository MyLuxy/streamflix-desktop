import { motion } from "framer-motion";
import { Trash2, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWatchlist } from "@/hooks/useWatchlist";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { WatchlistItem } from "@/lib/types";

interface WatchlistPageProps {
  onItemClick: (item: WatchlistItem) => void;
}

// imageUrl() already passes an absolute URL (hentai items, or anything from StreamFlix's own
// backend) through unchanged, so no per-mediaType branching is needed here anymore.
function posterSrc(item: WatchlistItem): string | null {
  return imageUrl(item.posterPath, IMAGE_SIZES.poster.medium);
}

export function WatchlistPage({ onItemClick }: WatchlistPageProps) {
  const { t } = useTranslation();
  const { watchlist, removeFromWatchlist } = useWatchlist();

  if (watchlist.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <motion.div
          key="watchlist-empty"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <Play className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t("watchlistPage.empty")}
          </h2>
          <p className="text-muted-foreground max-w-sm">
            {t("watchlistPage.addContent")}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      <motion.div
        key="watchlist-filled"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
          {t("watchlistPage.title")}
        </h1>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
          {watchlist.map((item, index) => (
            <motion.div
              key={`${item.mediaType}-${item.id}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative"
            >
              {/* Il box ombra sta SOLO qui, attorno alla sola locandina - prima si estendeva
                  (shadow-card è un'ombra larga, 8px offset + 32px blur) fin dentro al titolo sotto */}
              <div className="rounded-lg overflow-hidden shadow-md">
                <button
                  onClick={() => onItemClick(item)}
                  className="group relative w-full aspect-[2/3] block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                  {posterSrc(item) ? (
                    <img
                      src={posterSrc(item)!}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground text-xs">
                        No Image
                      </span>
                    </div>
                  )}

                  {/* Hover overlay più leggero */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Remove button — sopra la locandina, sfondo nero, hover rosso */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(item.id, item.mediaType);
                    }}
                    className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-red-600"
                  >
                    <Trash2 className="w-5 h-5 text-white" />
                  </div>
                </button>
              </div>

              {/* Title — nessun hover, solo testo */}
              <p className="mt-3 text-base font-medium text-foreground line-clamp-2">
                {item.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.mediaType === "hentai"
                  ? t("watchlistPage.typeHentai")
                  : item.mediaType === "tv"
                    ? t("watchlistPage.typeTV")
                    : t("watchlistPage.typeMovie")}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
