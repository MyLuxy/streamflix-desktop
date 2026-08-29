"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/Navigation";
import { ContentCard } from "@/components/ContentCard";
import { useLocale } from "@/hooks/useLocale";
import { useTranslation } from "react-i18next";
import { useHeroEntrance } from "@/hooks/useHeroEntrance";
import { hrefForItem } from "@/lib/links";
import { markRestoreIntent } from "@/lib/scroll-history";
import { popPreviousPath } from "@/lib/nav-history";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import type { Movie, TVShow, MediaItem } from "@/lib/types";

interface CategoryViewProps {
  slug: string;
  items: (Movie | TVShow | MediaItem)[];
  mediaType: "movie" | "tv";
  titleKey: string;
}

const NUM_COLUMNS = 7;

export function CategoryView({ slug, items, mediaType, titleKey }: CategoryViewProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  // Ingresso hero: sfondo neutro poi rivela; niente animazione al back.
  const { revealed: heroRevealed, instant: heroInstant } = useHeroEntrance();

  // La sezione hentai mostra solo "Hentai" come titolo.
  const title = slug === "hentai" ? "Hentai" : t(titleKey);

  // Distribuisce le locandine nelle colonne (round-robin). Ogni colonna avrà
  // poster duplicati per il loop invisibile.
  const columns = useMemo(() => {
    const posters = items
      .filter((i) => i.poster_path)
      .map((i) => imageUrl(i.poster_path, IMAGE_SIZES.poster.medium)!);
    const cols: string[][] = Array.from({ length: NUM_COLUMNS }, () => []);
    posters.forEach((url, idx) => {
      cols[idx % NUM_COLUMNS].push(url);
    });
    // Garantisce abbastanza poster per riempire la colonna anche se pochi titoli
    return cols.map((col) => {
      let filled = col;
      while (filled.length < 6 && col.length > 0) filled = [...filled, ...col];
      return filled;
    });
  }, [items]);

  const handleBack = () => {
    markRestoreIntent();
    // Stack di navigazione custom (coerente con DetailView), evita loop categoria↔film.
    const prev = popPreviousPath();
    if (prev) router.push(prev, { scroll: false });
    else router.push(`/${locale}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pb-24">
        {/* ===== Hero griglia animata (stile Crunchyroll) ===== */}
        <section
          className={`hero-grid relative w-full h-[56vh] min-h-[380px] md:h-[68vh] overflow-hidden bg-background ${heroRevealed ? "opacity-100" : "opacity-0"} ${heroInstant ? "" : "transition-opacity duration-700 ease-out"}`}
        >
          {/* Griglia di colonne scorrevoli, inclinata in prospettiva */}
          <div className="hero-grid-tilt absolute inset-0 flex justify-center gap-2 md:gap-3">
            {columns.map((col, i) => (
              <div key={i} className="hero-col w-[90px] sm:w-[120px] md:w-[150px] flex-shrink-0 overflow-hidden">
                <div
                  className={`hero-col-track ${i % 2 === 0 ? "hero-up" : "hero-down"}`}
                  style={{ animationDuration: `${90 + (i % 4) * 16}s` }}
                >
                  {[...col, ...col].map((url, j) => (
                    <img
                      key={j}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="w-full aspect-[2/3] object-cover rounded-lg mb-2 md:mb-3"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Overlay scuro per leggibilità + blend in basso col background */}
          <div className="hero-grid-dim absolute inset-0 bg-black/55" />
          <div className="hero-grid-blend absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
          <div className="hero-grid-topdim absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />

          {/* Back button */}
          <Button
            onClick={handleBack}
            variant="secondary"
            size="sm"
            className="back-btn absolute top-3 left-3 z-30 md:top-28 md:left-6 h-9 md:h-11 px-3 md:px-5 text-sm md:text-base md:[&_svg]:size-5 gap-1.5 bg-background/60 backdrop-blur-sm hover:bg-background/80"
          >
            <ArrowLeft />
            {t("content.goBack")}
          </Button>

          {/* Contenuto hero centrato */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 z-10 select-none">
            <motion.div
              initial={heroInstant ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <h1 className="hero-grid-title text-5xl md:text-7xl lg:text-8xl font-extrabold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] leading-none">
                {title}
              </h1>
              <p className="hero-grid-tagline text-base md:text-xl text-white/80 mt-4 italic font-light">
                {t(`category.taglines.${slug}`)}
              </p>
            </motion.div>
          </div>
        </section>

        {/* Barra opaca (colore pagina) che sale a coprire il bordo inferiore
            della hero: sta FUORI dalla hero, quindi non si deforma con lo
            scroll e nasconde lo sfarfallio dei bordi delle colonne. */}
        <div aria-hidden className="relative z-20 -mt-5 h-5 bg-background" />

        {/* ===== Griglia titoli ===== */}
        <div className="px-4 md:px-8 mt-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4"
          >
            {items.map((item) => {
              const itemTitle = "title" in item ? item.title : item.name;
              const date =
                "release_date" in item
                  ? item.release_date
                  : (item as TVShow).first_air_date;
              const year = date ? new Date(date).getFullYear().toString() : undefined;
              return (
                <ContentCard
                  key={`${mediaType}-${item.id}`}
                  posterPath={item.poster_path}
                  title={itemTitle}
                  rating={item.vote_average}
                  year={year}
                  href={hrefForItem(locale, item)}
                  inGrid
                />
              );
            })}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
