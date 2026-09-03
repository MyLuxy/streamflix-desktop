import { useCallback, useRef, useState } from "react";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { usesAniListArtwork } from "@/lib/anime-providers";

// tries tmdb (or anilist for anime providers) for the same title once a provider's own
// poster/backdrop 404s, call triggerFallback from an <img onError>, no-ops after the first try
export function useArtworkFallback(
  title: string,
  year: string | undefined,
  mediaType: "movie" | "tv",
  provider?: string
) {
  const [fallbackPoster, setFallbackPoster] = useState<string | null>(null);
  const [fallbackBackdrop, setFallbackBackdrop] = useState<string | null>(null);
  const triedRef = useRef(false);

  const triggerFallback = useCallback(() => {
    if (triedRef.current || !title) return;
    triedRef.current = true;
    const params = new URLSearchParams({ title, type: mediaType });
    if (year) params.set("year", year);
    if (usesAniListArtwork(provider)) params.set("anime", "1");
    fetch(`/api/artwork-fallback?${params}`)
      .then((r) => r.json())
      .then((d: { poster: string | null; backdrop: string | null }) => {
        if (d.poster) setFallbackPoster(imageUrl(d.poster, IMAGE_SIZES.poster.medium));
        if (d.backdrop) setFallbackBackdrop(imageUrl(d.backdrop, IMAGE_SIZES.backdrop.large));
      })
      .catch(() => {});
  }, [title, year, mediaType, provider]);

  return { fallbackPoster, fallbackBackdrop, triggerFallback };
}
