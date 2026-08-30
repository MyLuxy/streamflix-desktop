"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/Navigation";
import { HentaiRow } from "@/components/HentaiRow";
import { HentaiCard } from "@/components/HentaiCard";
import { HentaiFilterPanel, HentaiFilters, DEFAULT_FILTERS, filtersActive } from "@/components/HentaiFilterPanel";
import { HentaiPlayerModal } from "@/components/HentaiPlayerModal";
import { useLocale } from "@/hooks/useLocale";
import { useTranslation } from "react-i18next";
import { useHeroEntrance } from "@/hooks/useHeroEntrance";
import { markRestoreIntent } from "@/lib/scroll-history";
import { popPreviousPath } from "@/lib/nav-history";
import { searchHentai, filterHentai, hentaiId, type HentaiItem, type HentaiQuery, HENTAI_ROWS } from "@/lib/hentai";

const NUM_COLUMNS = 7;

interface RowData {
  key: string;
  title: string;
  items: HentaiItem[];
}

interface AniMeta {
  cover?: string | null;
  studio?: string | null;
}

const CACHE_TTL = 5 * 60 * 1000;
let cachedRows: RowData[] | null = null;
let cachedMeta: Record<string, AniMeta> = {};
let cachedTime = 0;

export function HentaiHubView() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { revealed: heroRevealed, instant: heroInstant } = useHeroEntrance();

  // debounced so text search doesnt fire on every keystroke
  const [filters, setFilters] = useState<HentaiFilters>(DEFAULT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<HentaiFilters>(DEFAULT_FILTERS);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedFilters(filters), 250);
    return () => clearTimeout(h);
  }, [filters]);
  const active = filtersActive(debouncedFilters);

  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);

  const [heroPosters, setHeroPosters] = useState<string[]>([]);
  const [playingItem, setPlayingItem] = useState<HentaiItem | null>(null);
  const [metaMap, setMetaMap] = useState<Record<string, AniMeta>>({});
  const requestedMeta = useRef<Set<string>>(new Set());

  const fetchMeta = useCallback(async (names: string[]) => {
    const need = [...new Set(names)].filter((n) => !requestedMeta.current.has(n));
    if (need.length === 0) return;
    need.forEach((n) => requestedMeta.current.add(n));
    try {
      const res = await fetch("/api/hentai/covers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: need }),
      });
      const data = await res.json();
      if (data?.meta) setMetaMap((prev) => ({ ...prev, ...data.meta }));
    } catch { /* best-effort */ }
  }, []);

  const withMeta = useCallback(
    (it: HentaiItem): HentaiItem => {
      const m = metaMap[it.name];
      return m ? { ...it, poster: m.cover || it.poster, brand: m.studio || it.brand } : it;
    },
    [metaMap]
  );

  const allItems = useMemo(
    () => [...new Map(rows.flatMap((r) => r.items.map((i) => [i.slug, i]))).values()],
    [rows]
  );

  // pushState so browser back closes just the modal
  const handlePlay = useCallback((item: HentaiItem) => {
    setPlayingItem(item);
    const url = new URL(window.location.href);
    url.searchParams.set("watch", item.slug);
    url.searchParams.delete("ep");
    url.searchParams.delete("n");
    window.history.pushState({ ...window.history.state, hentaiWatch: true }, "", url.toString());
  }, []);

  const handleClosePlayer = useCallback(() => {
    // we added the history entry so go back instead, popstate closes it
    if (typeof window !== "undefined" && window.history.state?.hentaiWatch) {
      window.history.back();
      return;
    }
    // direct link case, no history entry to pop, close manually
    setPlayingItem(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("watch");
    url.searchParams.delete("ep");
    url.searchParams.delete("n");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.get("watch")) setPlayingItem(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // opens modal on load if ?watch is in the url
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const watchSlug = params.get("watch");
    if (!watchSlug) return;
    const found = allItems.find((i) => i.slug === watchSlug);
    if (found) {
      setPlayingItem(found);
      return;
    }
    // not in the catalog (e.g. opened from watchlist), minimal item from the slug
    if (!loading) {
      setPlayingItem({
        id: hentaiId(watchSlug),
        slug: watchSlug,
        url: `https://hentaimama.io/tvshows/${watchSlug}/`,
        name: params.get("n") || watchSlug.replace(/-/g, " "),
        poster: null,
        year: null,
        rating: null,
        brand: "",
      });
    }
  }, [loading, allItems]);

  useEffect(() => {
    const now = Date.now();
    if (cachedRows && now - cachedTime < CACHE_TTL) {
      setRows(cachedRows);
      setMetaMap(cachedMeta);
      setLoading(false);
      return;
    }
    Promise.all(
      HENTAI_ROWS.map(async (cfg) => {
        try {
          const res = await searchHentai(cfg.query);
          return { key: cfg.key, title: t(cfg.titleKey!), items: res.items.slice(0, 24) };
        } catch {
          return { key: cfg.key, title: t(cfg.titleKey!), items: [] };
        }
      })
    ).then((data) => {
      setRows(data);
      cachedRows = data;
      cachedTime = Date.now();
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) rows.forEach((r) => fetchMeta(r.items.map((it) => it.name)));
  }, [loading, rows, fetchMeta]);

  useEffect(() => {
    if (!loading && Object.keys(metaMap).length > 0) {
      cachedMeta = metaMap;
    }
  }, [metaMap, loading]);

  useEffect(() => {
    fetch("/api/hentai/hero")
      .then((r) => r.json())
      .then((d) => { if (d?.posters?.length) setHeroPosters(d.posters); })
      .catch(() => {});
  }, []);

  // tmdb posters for the hero, falls back to row posters
  const columns = useMemo(() => {
    let pool = heroPosters.slice(0, 70);
    if (pool.length === 0) {
      const seen = new Set<number>();
      const posters: string[] = [];
      rows.forEach((r) => r.items.forEach((it) => {
        if (it.poster && !seen.has(it.id)) { seen.add(it.id); posters.push(it.poster); }
      }));
      pool = posters.slice(0, 70);
    }
    const cols: string[][] = Array.from({ length: NUM_COLUMNS }, () => []);
    pool.forEach((url, i) => cols[i % NUM_COLUMNS].push(url));
    return cols.map((col) => { let filled = col; while (filled.length < 6 && col.length > 0) filled = [...filled, ...col]; return filled; });
  }, [heroPosters, rows]);

  const f = debouncedFilters;
  const facetCount =
    f.genres.length + f.studios.length + f.years.length + (f.search.trim() ? 1 : 0);

  const fetchFilterPage = useCallback(
    async (page: number): Promise<{ items: HentaiItem[]; next?: number }> => {
      // single facet, paginated archive with everything that matches
      if (facetCount <= 1) {
        const q: HentaiQuery = { page };
        if (f.genres[0]) q.genre = f.genres[0];
        else if (f.studios[0]) q.studio = f.studios[0];
        else if (f.years[0]) q.year = f.years[0];
        else if (f.search.trim()) q.search = f.search.trim();
        const res = await searchHentai(q);
        return { items: res.items, next: res.hasMore ? page + 1 : undefined };
      }
      // multiple facets, one combined response, not paginated
      if (page > 1) return { items: [] };
      const res = await filterHentai({
        genres: f.genres,
        studios: f.studios,
        years: f.years,
        search: f.search,
      });
      return { items: res.items, next: undefined };
    },
    [facetCount, f]
  );

  const filterQuery = useInfiniteQuery({
    queryKey: ["hentai-filter", debouncedFilters],
    queryFn: ({ pageParam }) => fetchFilterPage(pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next,
    enabled: active,
    staleTime: 1000 * 60,
  });

  const results = useMemo<HentaiItem[]>(() => {
    const all = filterQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const seen = new Set<string>();
    return all.filter((it) => { if (seen.has(it.slug)) return false; seen.add(it.slug); return true; });
  }, [filterQuery.data]);

  const filterLoading = filterQuery.isLoading;

  useEffect(() => {
    if (results.length > 0) fetchMeta(results.map((i) => i.name));
  }, [results, fetchMeta]);

  const filterMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const el = filterMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && filterQuery.hasNextPage && !filterQuery.isFetchingNextPage) {
          filterQuery.fetchNextPage();
        }
      },
      { rootMargin: "800px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [active, filterQuery.hasNextPage, filterQuery.isFetchingNextPage, filterQuery.fetchNextPage, results.length]);

  const handleBack = () => {
    markRestoreIntent();
    const prev = popPreviousPath();
    if (prev) router.push(prev, { scroll: false });
    else router.push(`/${locale}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pb-24">
        <div className="relative">
          <Button onClick={handleBack} variant="secondary" size="sm"
            className="back-btn absolute top-3 left-3 z-30 md:top-28 md:left-6 h-9 md:h-11 px-3 md:px-5 text-sm md:text-base gap-1.5 bg-background/60 backdrop-blur-sm hover:bg-background/80">
            <ArrowLeft /> {t("content.goBack")}
          </Button>

          <section
            className={`hero-grid relative w-full h-[46vh] min-h-[320px] md:h-[56vh] overflow-hidden bg-background ${heroRevealed ? "opacity-100" : "opacity-0"} ${heroInstant ? "" : "transition-opacity duration-700 ease-out"}`}
          >
            <div className="hero-grid-tilt absolute inset-0 flex justify-center gap-2 md:gap-3">
              {columns.map((col, i) => (
                <div key={i} className="hero-col w-[90px] sm:w-[120px] md:w-[150px] flex-shrink-0 overflow-hidden">
                  <div className={`hero-col-track ${i % 2 === 0 ? "hero-up" : "hero-down"}`} style={{ animationDuration: `${90 + (i % 4) * 16}s` }}>
                    {[...col, ...col].map((url, j) => (
                      <img key={j} src={url} alt="" loading="lazy" className="w-full aspect-[2/3] object-cover rounded-lg mb-2 md:mb-3" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="hero-grid-dim absolute inset-0 bg-black/60" />
            <div className="hero-grid-blend absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
            <div className="hero-grid-topdim absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 z-10 select-none">
              <motion.div initial={heroInstant ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
                <h1 className="hero-grid-title text-5xl md:text-7xl lg:text-8xl font-extrabold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] leading-none">
                  {t("hentai.title")}
                </h1>
                <p className="hero-grid-tagline text-base md:text-xl text-white/80 mt-4 italic font-light">
                  {t("hentai.tagline")}
                </p>
              </motion.div>
            </div>
          </section>
        </div>

        {/* hides the column-edge flicker on scroll */}
        <div aria-hidden className="relative z-20 -mt-5 h-5 bg-background" />

        <div className="relative z-10 mt-6">
          <HentaiFilterPanel
            filters={filters}
            onChange={setFilters}
            resultCount={active && results.length > 0 ? results.length : null}
            hasMore={filterQuery.hasNextPage}
            loading={filterLoading}
          />
        </div>

        {active ? (
          <div className="px-4 md:px-10 mt-8">
            {filterLoading && results.length === 0 ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-pink-500" /></div>
            ) : results.length === 0 ? (
              <p className="text-center text-muted-foreground py-20">{t("hentai.noResults")}</p>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-3 md:gap-4">
                  {results.map((item) => (
                    <HentaiCard key={`${item.id}-${item.slug}`} item={withMeta(item)} inGrid onPlay={handlePlay} />
                  ))}
                </div>
                <div ref={filterMoreRef} className="h-12 flex items-center justify-center mt-6">
                  {filterQuery.isFetchingNextPage && (
                    <Loader2 className="w-7 h-7 animate-spin text-pink-500" />
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-2 md:space-y-4">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-pink-500" /></div>
            ) : (
              rows.map((row) => (
                <HentaiRow key={row.key} title={row.title} items={row.items.map(withMeta)} onPlay={handlePlay} />
              ))
            )}
          </div>
        )}
      </main>

      {playingItem && (
        <HentaiPlayerModal item={playingItem} onClose={handleClosePlayer} />
      )}
    </div>
  );
}
