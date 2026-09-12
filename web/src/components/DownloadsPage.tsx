"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Trash2, Film, Play, Pause, FolderOpen, AlertTriangle, MoreVertical, Ban, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDownloads } from "@/hooks/useDownloads";
import { useProviders } from "@/hooks/useStreamflix";
import { imageUrl, IMAGE_SIZES, proxyImage, GENERIC_PROVIDER_LOGO } from "@/lib/constants";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DownloadItem } from "@/lib/types";

interface DownloadsPageProps {
  onPlay: (item: DownloadItem) => void;
}

function episodeLabel(item: DownloadItem): string | null {
  if (item.mediaType !== "tv") return null;
  return `S${item.season}E${item.episode}${item.episodeTitle ? ` · ${item.episodeTitle}` : ""}`;
}

export function DownloadsPage({ onPlay }: DownloadsPageProps) {
  const { t } = useTranslation();
  const { downloads, removeDownload, deleteDownloadedFile, cancelDownload, togglePause, retryDownload } = useDownloads();
  const { data: providers } = useProviders();
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [cancelingKey, setCancelingKey] = useState<string | null>(null);

  const providerLogo = (name: string) => providers?.find((p) => p.name === name)?.logo;

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

  const inProgress = downloads.filter((d) => d.status !== "done");
  const ready = downloads.filter((d) => d.status === "done");

  const handleConfirmDelete = () => {
    if (confirmDeleteKey) deleteDownloadedFile(confirmDeleteKey);
    setConfirmDeleteKey(null);
  };

  const poster = (item: DownloadItem) => {
    const src = imageUrl(item.posterPath, IMAGE_SIZES.poster.medium);
    const logo = providerLogo(item.provider);
    return (
      <div className="relative w-40 sm:w-60 aspect-[2/3] rounded-lg overflow-hidden bg-muted flex-shrink-0">
        {src ? (
          <ImageWithSpinner src={src} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <img
          src={logo ? proxyImage(logo) : GENERIC_PROVIDER_LOGO}
          alt={item.provider}
          className="absolute bottom-2 right-2 w-11 h-11 rounded-md object-cover bg-black/80 shadow-md"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (img.src.endsWith(GENERIC_PROVIDER_LOGO)) return;
            img.src = GENERIC_PROVIDER_LOGO;
          }}
        />
      </div>
    );
  };

  return (
    <div className="space-y-10">
      <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 md:mb-8">{t("downloadsPage.title")}</h1>

      {inProgress.length > 0 && (
        <section>
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-3">{t("downloadsPage.inProgress")}</h2>
          <div className="space-y-3">
            {inProgress.map((item) => (
              <div key={item.key} className="relative flex items-center gap-14 p-3 rounded-lg bg-card border border-border max-w-5xl">
                {poster(item)}
                <div className="flex-1 min-w-0">
                  <p className="text-xl sm:text-2xl font-medium text-foreground truncate">
                    {item.title}
                    {episodeLabel(item) ? ` · ${episodeLabel(item)}` : ""}
                  </p>
                  {item.status === "failed" ? (
                    <p className="text-lg sm:text-xl text-destructive flex items-center gap-2 mt-2">
                      <AlertTriangle className="w-5 h-5" />
                      {t("downloadsPage.failed")}
                    </p>
                  ) : (
                    <>
                      <p className="text-lg sm:text-xl text-muted-foreground mt-2">
                        {item.paused
                          ? t("downloadsPage.pausedLabel")
                          : t(`downloadsPage.${item.phase === "encoding" ? "encoding" : item.phase === "fetching" ? "fetching" : "resolving"}`)}
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <div className="w-full max-w-lg h-4 sm:h-5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-[width] duration-500"
                            style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }}
                          />
                        </div>
                        <span className="text-base sm:text-lg text-muted-foreground font-medium tabular-nums">
                          {Math.round((item.progress ?? 0) * 100)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("downloadsPage.options")}
                      className="absolute top-3 right-3 h-10 w-10 [&_svg]:size-6 hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                      <MoreVertical className="w-6 h-6" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[9rem] p-2">
                    {item.status === "failed" ? (
                      <>
                        <DropdownMenuItem onClick={() => retryDownload(item.key)} className="text-base py-3 px-3 cursor-pointer focus:bg-secondary focus:text-foreground">
                          <RotateCw className="w-5 h-5 mr-3" />
                          {t("downloadsPage.retry")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => removeDownload(item.key)} className="text-base py-3 px-3 cursor-pointer focus:bg-secondary focus:text-foreground">
                          <Trash2 className="w-5 h-5 mr-3" />
                          {t("downloadsPage.delete")}
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        {item.phase !== "encoding" && (
                          <DropdownMenuItem onClick={() => togglePause(item.key)} className="text-base py-3 px-3 cursor-pointer focus:bg-secondary focus:text-foreground">
                            {item.paused ? <Play className="w-5 h-5 mr-3" /> : <Pause className="w-5 h-5 mr-3" />}
                            {item.paused ? t("downloadsPage.resume") : t("downloadsPage.pause")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setCancelingKey(item.key);
                          }}
                          className="text-base py-3 px-3 cursor-pointer text-destructive focus:bg-secondary focus:text-destructive"
                        >
                          <Ban className="w-5 h-5 mr-3" />
                          {t("downloadsPage.cancel")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </section>
      )}

      <AlertDialog open={cancelingKey !== null} onOpenChange={(open) => !open && setCancelingKey(null)}>
        <AlertDialogContent className="max-w-2xl p-10 gap-8">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-3xl">{t("downloadsPage.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-lg">{t("downloadsPage.cancelDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 min-w-[9rem] text-base">{t("content.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelingKey) cancelDownload(cancelingKey);
                setCancelingKey(null);
              }}
              className="h-12 min-w-[9rem] text-base bg-red-500 text-white hover:bg-red-500/90"
            >
              {t("downloadsPage.cancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {ready.length > 0 && (
        <section>
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-3">{t("downloadsPage.ready")}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
            {ready.map((item) => {
              const src = imageUrl(item.posterPath, IMAGE_SIZES.poster.medium);
              const logo = providerLogo(item.provider);
              return (
                <div key={item.key} className="relative">
                  <div className="relative rounded-lg overflow-hidden shadow-md">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onPlay(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onPlay(item);
                      }}
                      className="group relative w-full aspect-[2/3] block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                    >
                      {src ? (
                        <ImageWithSpinner src={src} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Film className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      <img
                        src={logo ? proxyImage(logo) : GENERIC_PROVIDER_LOGO}
                        alt={item.provider}
                        className="absolute bottom-2 right-2 w-9 h-9 md:w-11 md:h-11 rounded-md object-cover bg-black/80 shadow-md"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (img.src.endsWith(GENERIC_PROVIDER_LOGO)) return;
                          img.src = GENERIC_PROVIDER_LOGO;
                        }}
                      />
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("downloadsPage.options")}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-2 right-2 h-10 w-10 [&_svg]:size-6 hover:bg-secondary hover:text-foreground cursor-pointer"
                        >
                          <MoreVertical className="w-6 h-6" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[9rem] p-2">
                        <DropdownMenuItem
                          onClick={() => item.filePath && window.streamflixDesktop?.showInFolder(item.filePath)}
                          className="text-base py-3 px-3 cursor-pointer focus:bg-secondary focus:text-foreground"
                        >
                          <FolderOpen className="w-5 h-5 mr-3" />
                          {t("downloadsPage.openFolder")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setConfirmDeleteKey(item.key);
                          }}
                          className="text-base py-3 px-3 cursor-pointer text-destructive focus:bg-secondary focus:text-destructive"
                        >
                          <Trash2 className="w-5 h-5 mr-3" />
                          {t("downloadsPage.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <p className="mt-3 text-base font-medium text-foreground truncate">{item.title}</p>
                  {episodeLabel(item) && (
                    <p className="text-sm text-muted-foreground truncate">{episodeLabel(item)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <AlertDialog open={confirmDeleteKey !== null} onOpenChange={(open) => !open && setConfirmDeleteKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("downloadsPage.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("downloadsPage.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("content.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-500 text-white hover:bg-red-500/90">
              {t("downloadsPage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
