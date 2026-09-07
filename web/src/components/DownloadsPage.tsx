"use client";

import { motion } from "framer-motion";
import { Download, Trash2, Film } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDownloads } from "@/hooks/useDownloads";
import { imageUrl, IMAGE_SIZES } from "@/lib/constants";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";
import type { DownloadItem } from "@/lib/types";

interface DownloadsPageProps {
  onItemClick: (item: DownloadItem) => void;
}

export function DownloadsPage({ onItemClick }: DownloadsPageProps) {
  const { t } = useTranslation();
  const { downloads, removeDownload } = useDownloads();

  if (downloads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <motion.div
          key="downloads-empty"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <Download className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t("downloadsPage.empty")}
          </h2>
          <p className="text-muted-foreground max-w-sm">
            {t("downloadsPage.addContent")}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
        {t("downloadsPage.title")}
      </h1>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
        {downloads.map((item, index) => {
          const poster = imageUrl(item.posterPath, IMAGE_SIZES.poster.medium);
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative"
            >
              <div className="rounded-lg overflow-hidden shadow-md">
                <button
                  onClick={() => onItemClick(item)}
                  className="group relative w-full aspect-[2/3] block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                  {poster ? (
                    <ImageWithSpinner src={poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Film className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDownload(item.key);
                    }}
                    className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-red-600"
                  >
                    <Trash2 className="w-5 h-5 text-white" />
                  </div>
                </button>
              </div>

              <p className="mt-3 text-base font-medium text-foreground line-clamp-2">
                {item.title}
              </p>
              {item.mediaType === "tv" && (
                <p className="text-sm text-muted-foreground">
                  S{item.season}E{item.episode}
                  {item.episodeTitle ? ` · ${item.episodeTitle}` : ""}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
