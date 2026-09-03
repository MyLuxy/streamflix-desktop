"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Loader2 } from "lucide-react";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";
import { useArtworkFallback } from "@/hooks/useArtworkFallback";

interface ContentCardProps {
  posterPath: string | null;
  title: string;
  rating?: number;
  year?: string;
  href?: string;
  onClick?: () => void;
  inGrid?: boolean;
  // only used to look up an artwork fallback when the provider's own poster is dead
  mediaType?: "movie" | "tv";
  provider?: string;
  // landscape for live-tv channel logos, portrait (default) for movie/show posters
  orientation?: "portrait" | "landscape";
}

export function ContentCard({
  posterPath,
  title,
  rating,
  year,
  href,
  onClick,
  inGrid = false,
  mediaType = "tv",
  provider,
  orientation = "portrait",
}: ContentCardProps) {
  const [loading, setLoading] = useState(false);
  const { fallbackPoster, triggerFallback } = useArtworkFallback(title, year, mediaType, provider);
  const isLandscape = orientation === "landscape";

  const posterUrl = fallbackPoster ?? imageUrl(posterPath, IMAGE_SIZES.poster.medium);

  const inner = (
    <div className={`relative rounded-lg overflow-hidden shadow-card transition-shadow duration-300 group-hover:shadow-glow ${isLandscape ? "aspect-video bg-secondary/40" : "aspect-[2/3]"}`}>
      {/* title is a sibling not a child, otherwise it scales up with the hover too */}
      <div className={`absolute inset-0 transition-transform duration-300 group-hover:scale-105 ${isLandscape ? "p-4" : ""}`}>
        {posterUrl ? (
          <ImageWithSpinner
            src={posterUrl}
            alt={title}
            className={`w-full h-full transition-transform duration-300 group-hover:scale-110 ${isLandscape ? "object-contain" : "object-cover"}`}
            loading="lazy"
            onError={triggerFallback}
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-xs">No Image</span>
          </div>
        )}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <p className="text-foreground font-semibold text-sm line-clamp-2 text-left">
          {title}
        </p>
        {year && (
          <p className="text-muted-foreground text-xs mt-1 text-left">{year}</p>
        )}
      </div>

      {/* shows instantly on click so it doesnt feel laggy */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-[1px]">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

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
    : isLandscape
      ? "group relative flex-shrink-0 w-[220px] sm:w-[260px] md:w-[300px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg overflow-hidden snap-start"
      : "group relative flex-shrink-0 w-[160px] sm:w-[180px] md:w-[220px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg overflow-hidden snap-start";

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
