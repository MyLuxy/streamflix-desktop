import { useCallback, useRef, useState } from "react";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";

// tries tmdb for the same title once a provider's own poster/backdrop 404s, call
// triggerFallback from an <img onError>, it no-ops after the first attempt
export function useArtworkFallback(title: string, year: string | undefined, mediaType: "movie" | "tv") {
  const [fallbackPoster, setFallbackPoster] = useState<string | null>(null);
  const [fallbackBackdrop, setFallbackBackdrop] = useState<string | null>(null);
  const triedRef = useRef(false);

  const triggerFallback = useCallback(() => {
    if (triedRef.current || !title) return;
    triedRef.current = true;
    const params = new URLSearchParams({ title, type: mediaType });
    if (year) params.set("year", year);
    fetch(`/api/artwork-fallback?${params}`)
      .then((r) => r.json())
      .then((d: { poster: string | null; backdrop: string | null }) => {
        if (d.poster) setFallbackPoster(imageUrl(d.poster, IMAGE_SIZES.poster.medium));
        if (d.backdrop) setFallbackBackdrop(imageUrl(d.backdrop, IMAGE_SIZES.backdrop.large));
      })
      .catch(() => {});
  }, [title, year, mediaType]);

  return { fallbackPoster, fallbackBackdrop, triggerFallback };
}
