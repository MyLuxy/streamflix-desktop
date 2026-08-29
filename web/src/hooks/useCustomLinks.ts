import { useState, useEffect, useCallback } from "react";
import { CustomLink, ContentLinks } from "@/lib/types";

const STORAGE_KEY = "streamify-custom-links";

export function useCustomLinks() {
  const [links, setLinks] = useState<ContentLinks>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return {};
        }
      }
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }, [links]);

  const getContentKey = (id: number, mediaType: "movie" | "tv") => 
    `${mediaType}-${id}`;

  const getLinks = useCallback(
    (id: number, mediaType: "movie" | "tv"): CustomLink[] => {
      const key = getContentKey(id, mediaType);
      return links[key] || [];
    },
    [links]
  );

  const addLink = useCallback(
    (id: number, mediaType: "movie" | "tv", url: string, label?: string) => {
      const key = getContentKey(id, mediaType);
      const existingLinks = links[key] || [];
      
      const newLink: CustomLink = {
        id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url,
        label: label || `Link ${existingLinks.length + 1}`,
        addedAt: Date.now(),
      };
      
      setLinks((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), newLink],
      }));
      
      return newLink;
    },
    [links]
  );

  const removeLink = useCallback(
    (id: number, mediaType: "movie" | "tv", linkId: string) => {
      const key = getContentKey(id, mediaType);
      
      setLinks((prev) => ({
        ...prev,
        [key]: (prev[key] || []).filter((l) => l.id !== linkId),
      }));
    },
    []
  );

  const hasCustomLinks = useCallback(
    (id: number, mediaType: "movie" | "tv"): boolean => {
      const key = getContentKey(id, mediaType);
      return (links[key]?.length || 0) > 0;
    },
    [links]
  );

  return {
    getLinks,
    addLink,
    removeLink,
    hasCustomLinks,
  };
}
