import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { useStreamflixSearch } from "@/hooks/useStreamflix";
import { toMediaItemClient } from "@/lib/streamflix-client";
import { getSelectedProviderClient } from "@/lib/provider";
import { IMAGE_SIZES, imageUrl } from "@/lib/constants";
import { MediaItem } from "@/lib/types";

interface SearchBarProps {
  onResultClick: (item: MediaItem) => void;
}

export function SearchBar({ onResultClick }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const provider = getSelectedProviderClient();
  const { data: rawResults, isLoading } = useStreamflixSearch(provider, query, isOpen);
  const results = rawResults?.map((r) => toMediaItemClient(r, provider));

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = (item: MediaItem) => {
    onResultClick(item);
    setIsOpen(false);
    setQuery("");
  };

  const getTitle = (item: MediaItem) => {
    return "title" in item ? item.title : item.name;
  };

  const getYear = (item: MediaItem) => {
    const date = "release_date" in item ? item.release_date : item.first_air_date;
    return date ? new Date(date).getFullYear() : null;
  };

  return (
    <div ref={containerRef} className="relative">
      <AnimatePresence mode="wait">
        {isOpen ? (
          <motion.div
            initial={{ width: 40, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 40, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies & shows..."
              className="pl-10 pr-10 bg-secondary/80 border-border/50 focus:border-primary"
            />
            <button
              onClick={() => {
                setIsOpen(false);
                setQuery("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
            aria-label="Open search"
          >
            <Search className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Search results dropdown */}
      <AnimatePresence>
        {isOpen && query.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-50"
          >
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-12 h-16 bg-muted rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results && results.length > 0 ? (
              <div className="py-2">
                {results.slice(0, 8).map((item) => (
                  <button
                    key={`${item.media_type}-${item.id}`}
                    onClick={() => handleResultClick(item)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-secondary/50 transition-colors text-left"
                  >
                    {item.poster_path ? (
                      <img
                        src={imageUrl(item.poster_path, IMAGE_SIZES.poster.small) ?? undefined}
                        alt={getTitle(item)}
                        className="w-10 h-14 object-cover rounded"
                      />
                    ) : (
                      <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">N/A</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {getTitle(item)}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">
                          {item.media_type === "tv" ? "TV Series" : "Movie"}
                        </span>
                        {getYear(item) && <span>• {getYear(item)}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                No results found for "{query}"
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
