"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X, Star, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { searchStreamflix } from "@/hooks/useStreamflix";
import { toMediaItemClient } from "@/lib/streamflix-client";
import { getSelectedProviderClient } from "@/lib/provider";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { MediaItem } from "@/lib/types";
import { ImageWithSpinner } from "@/components/ImageWithSpinner";

// kept the hentai variant for SearchView.tsx compat, this page doesnt produce those results anymore
export type SearchClickPayload =
  | { kind: "tmdb"; item: MediaItem }
  | { kind: "hentai"; slug: string; name: string };

interface SearchPageProps {
  onItemClick: (payload: SearchClickPayload) => void;
}

const PAGE_SIZE = 30;

export function SearchPage({ onItemClick }: SearchPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(h);
  }, [query]);

  useEffect(() => {
    const h = setTimeout(() => {
      const qs = query ? `?q=${encodeURIComponent(query)}` : "";
      router.replace(qs ? `${pathname}${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(h);
  }, [query, pathname, router]);

  const hasQuery = debouncedQuery.trim().length >= 2;

  const getYear = (item: MediaItem) => {
    const date = "release_date" in item ? item.release_date : item.first_air_date;
    return date ? new Date(date).getFullYear() : null;
  };
  const getTitle = (item: MediaItem) => ("title" in item ? item.title : item.name);

  const processResults = useCallback((raw: MediaItem[]): MediaItem[] => {
    return raw
      .map((it) => ({
        ...it,
        media_type: it.media_type || ("title" in it ? "movie" : "tv"),
      }))
      .filter((it) => it.media_type === "movie" || it.media_type === "tv")
      .filter((it) => !(it as { adult?: boolean }).adult)
      .filter((it) => it.poster_path) as MediaItem[];
  }, []);

  // backend doesnt paginate text search, gets everything in one go, chunking happens on render only
  const fetchResults = useCallback(async (): Promise<MediaItem[]> => {
    if (!hasQuery) return [];
    const provider = getSelectedProviderClient();
    const raw = await searchStreamflix(provider, debouncedQuery);
    return processResults(raw.map((r) => toMediaItemClient(r, provider)));
  }, [hasQuery, debouncedQuery, processResults]);

  const { data, isLoading } = useInfiniteQuery({
    queryKey: ["search-v3", hasQuery ? debouncedQuery : ""],
    queryFn: fetchResults,
    initialPageParam: 0,
    getNextPageParam: () => undefined,
    staleTime: 1000 * 60 * 2,
  });

  const results = useMemo<MediaItem[]>(() => {
    const all = data?.pages[0] ?? [];
    const seen = new Set<string>();
    return all.filter((it) => {
      const k = `${it.media_type}-${it.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [data]);

  // catches the 300ms debounce gap so the spinner shows right away, not just after the fetch starts
  const isPending = query.trim().length >= 2 && query !== debouncedQuery;
  const loading = hasQuery && isLoading;
  const isSearching = isPending || loading;
  const isEmpty = !isSearching && hasQuery && results.length === 0;

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery]);
  const visibleResults = results.slice(0, visibleCount);
  const hasMoreToReveal = visibleCount < results.length;

  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((v) => Math.min(v + PAGE_SIZE, results.length));
        }
      },
      { rootMargin: "800px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [results.length]);

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 md:mb-8">
          {t("search.title")}
        </h1>

        <div className="relative mb-8 md:mb-10">
          <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 w-6 h-6 md:w-7 md:h-7 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="pl-14 md:pl-16 pr-14 md:pr-16 py-8 md:py-10 text-xl md:text-2xl bg-secondary border-border/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-border/50"
          />
          {isSearching ? (
            <Loader2 className="absolute right-5 md:right-6 top-1/2 -translate-y-1/2 w-6 h-6 md:w-7 md:h-7 text-muted-foreground animate-spin" />
          ) : (
            query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-5 md:right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t("hentai.clear")}
              >
                <X className="w-6 h-6 md:w-7 md:h-7" />
              </button>
            )
          )}
        </div>

        {!hasQuery && !isSearching && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <Search className="w-10 h-10 text-muted-foreground/40 mb-4" />
            <p className="text-lg text-muted-foreground">{t("search.hint")}</p>
          </div>
        )}

        {isSearching ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[2/3] bg-muted rounded-lg animate-pulse" />
                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <p className="text-lg text-foreground mb-2">
              {t("search.noResultsFor", { query: debouncedQuery })}
            </p>
            <p className="text-muted-foreground">{t("search.tryDifferent")}</p>
          </div>
        ) : hasQuery ? (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {visibleResults.map((item, index) => (
                <motion.button
                  key={`${item.media_type}-${item.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min((index % PAGE_SIZE) * 0.02, 0.3) }}
                  onClick={() => onItemClick({ kind: "tmdb", item })}
                  className="group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-card mb-2">
                    {item.poster_path ? (
                      <ImageWithSpinner
                        src={imageUrl(item.poster_path, IMAGE_SIZES.poster.medium) ?? undefined}
                        alt={getTitle(item)}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <span className="text-muted-foreground text-xs">No Image</span>
                      </div>
                    )}
                    {item.vote_average > 0 && (
                      <div className="absolute top-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Star className="w-3 h-3 fill-white" />
                        {item.vote_average.toFixed(1)}
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm text-foreground text-xs font-medium px-2 py-0.5 rounded-md">
                      {item.media_type === "tv" ? t("search.badgeTV") : t("search.badgeMovie")}
                    </div>
                  </div>
                  <p className="font-medium text-foreground line-clamp-2 text-sm">{getTitle(item)}</p>
                  {getYear(item) && <p className="text-xs text-muted-foreground">{getYear(item)}</p>}
                </motion.button>
              ))}
            </div>

            {hasMoreToReveal && (
              <div ref={loadMoreRef} className="h-12 flex items-center justify-center mt-6">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            )}
          </>
        ) : null}
      </motion.div>
    </div>
  );
}
