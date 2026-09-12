import { motion } from "framer-motion";
import { Trash2, Play, MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useProviders } from "@/hooks/useStreamflix";
import { IMAGE_SIZES, imageUrl, proxyImage, GENERIC_PROVIDER_LOGO } from "@/lib/constants";
import { WatchlistItem } from "@/lib/types";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WatchlistPageProps {
  onItemClick: (item: WatchlistItem) => void;
}

// imageUrl() already passes an absolute URL through unchanged, no per-mediaType branching needed
function posterSrc(item: WatchlistItem): string | null {
  return imageUrl(item.posterPath, IMAGE_SIZES.poster.medium);
}

export function WatchlistPage({ onItemClick }: WatchlistPageProps) {
  const { t } = useTranslation();
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const { data: providers } = useProviders();

  // a title from a hidden/removed provider falls back to the generic icon instead of a broken image
  const providerLogo = (name: string | undefined) =>
    providers?.find((p) => p.name === name)?.logo;

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
        <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 md:mb-8">
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
              <div className="relative rounded-lg overflow-hidden shadow-md">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onItemClick(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onItemClick(item);
                  }}
                  className="group relative w-full aspect-[2/3] block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                  {posterSrc(item) ? (
                    <ImageWithSpinner
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

                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {(() => {
                    const logo = providerLogo(item.provider);
                    return (
                      <img
                        src={logo ? proxyImage(logo) : GENERIC_PROVIDER_LOGO}
                        alt={item.provider || ""}
                        className="absolute bottom-2 right-2 w-9 h-9 md:w-11 md:h-11 rounded-md object-cover bg-black/80 shadow-md"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (img.src.endsWith(GENERIC_PROVIDER_LOGO)) return;
                          img.src = GENERIC_PROVIDER_LOGO;
                        }}
                      />
                    );
                  })()}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("watchlistPage.remove")}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-2 right-2 h-10 w-10 [&_svg]:size-6 hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                      <MoreVertical className="w-6 h-6" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[9rem] p-2">
                    <DropdownMenuItem
                      onClick={() => removeFromWatchlist(item.id, item.mediaType)}
                      className="text-base py-3 px-3 cursor-pointer text-destructive focus:bg-secondary focus:text-destructive"
                    >
                      <Trash2 className="w-5 h-5 mr-3" />
                      {t("watchlistPage.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <p className="mt-3 text-base font-medium text-foreground line-clamp-2">
                {item.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.mediaType === "tv" ? t("watchlistPage.typeTV") : t("watchlistPage.typeMovie")}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
