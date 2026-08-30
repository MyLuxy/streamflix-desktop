"use client";

import { useEffect, useRef, useState } from "react";
import { ContentRow } from "@/components/ContentRow";
import { useGenreItems } from "@/hooks/useStreamflix";
import { toMediaItem } from "@/lib/streamflix-mapping";
import { CUSTOM_HOME_SECTIONS } from "@/lib/custom-home-sections";
import type { Movie, TVShow, MediaItem } from "@/lib/types";

const PAGE_SIZE = 5;

interface CustomGenreSectionsProps {
  provider: string;
  onItemClick: (item: Movie | TVShow | MediaItem) => void;
}

// loads more as you scroll near the bottom, avoids firing every genre request at once
export function CustomGenreSections({ provider, onItemClick }: CustomGenreSectionsProps) {
  const sections = CUSTOM_HOME_SECTIONS[provider];
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = !!sections && visibleCount < sections.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    // loads a bit before it actually hits the screen so scroll never waits
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => c + PAGE_SIZE);
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  if (!sections || sections.length === 0) return null;

  const visible = sections.slice(0, visibleCount);

  return (
    <>
      {visible.map((section) => (
        <GenreRow
          key={section.genreId}
          provider={provider}
          section={section}
          onItemClick={onItemClick}
        />
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-1" />}
    </>
  );
}

function GenreRow({
  provider,
  section,
  onItemClick,
}: {
  provider: string;
  section: { label: string; genreId: string };
  onItemClick: (item: Movie | TVShow | MediaItem) => void;
}) {
  const { data, isFetching } = useGenreItems(provider, section.genreId);

  // skip empty genres once loaded, not before
  if (!isFetching && (!data || data.length === 0)) return null;

  const items = (data ?? []).map((dto) => toMediaItem(dto, provider));

  return (
    <ContentRow
      title={section.label}
      items={items}
      isLoading={isFetching}
      onItemClick={onItemClick}
    />
  );
}
