"use client";

import Link from "next/link";
import { Play, Star, Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/hooks/useLocale";
import { useWatchlist } from "@/hooks/useWatchlist";
import { type HentaiItem } from "@/lib/hentai";

interface HentaiCardProps {
  item: HentaiItem;
  /** In griglia occupa l'intera colonna; altrimenti larghezza fissa (riga). */
  inGrid?: boolean;
  /** Se fornito, intercetta il click e apre un modale invece di navigare. */
  onPlay?: (item: HentaiItem) => void;
}

export function HentaiCard({ item, inGrid = false, onPlay }: HentaiCardProps) {
  const locale = useLocale();
  const { t } = useTranslation();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const saved = isInWatchlist(item.id, "hentai");

  const onSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist({
      id: item.id,
      mediaType: "hentai",
      title: item.name,
      posterPath: item.poster,
      slug: item.slug,
    });
  };

  const className = inGrid
    ? "group block w-full text-left cursor-pointer focus:outline-none"
    : "group block flex-shrink-0 w-[150px] sm:w-[170px] md:w-[200px] text-left cursor-pointer focus:outline-none snap-start";

  const inner = (
    <>
      {/* Locandina: solo lieve ingrandimento, nessun velo scuro in hover */}
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-card">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-xs">No Image</span>
          </div>
        )}

        {/* Play in hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="w-12 h-12 rounded-full bg-pink-600/90 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 fill-white text-white translate-x-[1px]" />
          </span>
        </div>

        {/* Salva in watchlist — cuore in alto a destra, visibile solo in hover */}
        <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity group/save">
          <div
            role="button"
            tabIndex={0}
            onClick={onSave}
            aria-label={saved ? t("watchlistPage.remove") : t("watchlistPage.add")}
            className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-colors ${
              saved ? "bg-pink-600 text-white" : "bg-black/70 text-white hover:bg-pink-600"
            }`}
          >
            <Heart className={`w-5 h-5 ${saved ? "fill-current" : ""}`} />
          </div>
          {/* Tooltip */}
          <span className="pointer-events-none absolute right-0 top-11 whitespace-nowrap rounded-md bg-black/90 text-white text-[11px] font-medium px-2 py-1 opacity-0 group-hover/save:opacity-100 transition-opacity">
            {saved ? t("watchlistPage.remove") : t("watchlistPage.add")}
          </span>
        </div>

        {/* Rating (sito host) in basso a sinistra */}
        {item.rating != null && item.rating > 0 && (
          <div className="absolute bottom-2 left-2 bg-black/75 text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {item.rating.toFixed(1)}
          </div>
        )}
      </div>

      {/* Titolo + studio · anno SOTTO la locandina.
          Altezza fissa (2 righe titolo + 1 riga meta) così i titoli lunghi
          non spostano la posizione delle locandine: restano tutte allineate. */}
      <div className="pt-2">
        <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug min-h-[2.5rem]">
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate min-h-[1rem]">
          {[item.brand, item.year].filter(Boolean).join(" · ")}
        </p>
      </div>
    </>
  );

  return onPlay ? (
    <button onClick={() => onPlay(item)} className={className} aria-label={item.name}>
      {inner}
    </button>
  ) : (
    <Link href={`/${locale}/hentai/${item.slug}?n=${encodeURIComponent(item.name)}`} className={className} aria-label={item.name}>
      {inner}
    </Link>
  );
}
