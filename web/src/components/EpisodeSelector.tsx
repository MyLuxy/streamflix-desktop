import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, ChevronUp } from "lucide-react";

interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
}

interface EpisodeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (season: number, episode: number) => void;
  seasons: Season[];
  title: string;
}

export function EpisodeSelector({
  isOpen,
  onClose,
  onSelect,
  seasons,
  title,
}: EpisodeSelectorProps) {
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSeasons = seasons.filter((s) => s.season_number > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Select Episode
              </h3>
              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                {title}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Seasons List - scrollabile */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredSeasons.map((season) => (
            <div key={season.id} className="border border-border rounded-lg overflow-hidden">
              {/* Season Header */}
              <button
                onClick={() =>
                  setExpandedSeason(
                    expandedSeason === season.season_number ? null : season.season_number
                  )
                }
                className="w-full flex items-center justify-between p-3 bg-secondary hover:bg-secondary/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-sm">
                      {season.season_number}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-foreground text-sm">
                      {season.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {season.episode_count} episodes
                    </p>
                  </div>
                </div>
                {expandedSeason === season.season_number ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>

              {/* Episodes Grid */}
              {expandedSeason === season.season_number && (
                <div className="p-3 bg-muted/30 grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {Array.from(
                    { length: season.episode_count },
                    (_, i) => i + 1
                  ).map((ep) => (
                    <button
                      key={ep}
                      onClick={() => onSelect(season.season_number, ep)}
                      className="aspect-square rounded-lg bg-secondary hover:bg-primary hover:text-primary-foreground transition-all font-semibold text-sm border border-border hover:border-primary flex items-center justify-center"
                    >
                      {ep}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex-shrink-0">
          <Button variant="ghost" onClick={onClose} className="w-full">
            Cancel
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}