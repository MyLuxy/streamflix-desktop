"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Loader2 } from "lucide-react";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";

interface ContentCardProps {
  posterPath: string | null;
  title: string;
  rating?: number;
  year?: string;
  href?: string;
  onClick?: () => void;
  /** In una griglia la card occupa tutta la colonna invece di larghezza fissa. */
  inGrid?: boolean;
}

export function ContentCard({
  posterPath,
  title,
  rating,
  year,
  href,
  onClick,
  inGrid = false,
}: ContentCardProps) {
  const [loading, setLoading] = useState(false);

  const posterUrl = imageUrl(posterPath, IMAGE_SIZES.poster.medium);

  const inner = (
    <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-card transition-shadow duration-300 group-hover:shadow-glow">
      {/* Solo questo wrapper si ingrandisce all'hover - il rating badge sta fuori (sotto),
          così resta a dimensione fissa invece di scalare insieme al resto */}
      <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-xs">No Image</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Title on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <p className="text-foreground font-semibold text-sm line-clamp-2 text-left">
            {title}
          </p>
          {year && (
            <p className="text-muted-foreground text-xs mt-1 text-left">{year}</p>
          )}
        </div>
      </div>

      {/* Rotella di caricamento: appare subito al click, evita la sensazione di lag */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-[1px]">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* Rating badge */}
      {rating !== undefined && rating > 0 && (
        <div className="absolute top-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
          <Star className="w-3 h-3 fill-white" />
          {rating.toFixed(1)}
        </div>
      )}
    </div>
  );

  const className = inGrid
    ? "group relative w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg overflow-hidden"
    : "group relative flex-shrink-0 w-[160px] sm:w-[180px] md:w-[220px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg overflow-hidden snap-start";

  // Con href usa <Link> (prefetch automatico in produzione = navigazione istantanea)
  if (href) {
    return (
      <Link
        href={href}
        className={className}
        aria-label={title}
        onClick={() => setLoading(true)}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      onClick={() => {
        setLoading(true);
        onClick?.();
      }}
      className={className}
    >
      {inner}
    </button>
  );
}
