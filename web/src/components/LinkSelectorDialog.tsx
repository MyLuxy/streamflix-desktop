import { useState, useEffect } from "react";
import { Play, Youtube, Link as LinkIcon, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CustomLink } from "@/lib/types";

interface StreamingSource {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

interface LinkSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string, isTrailer: boolean) => void;
  trailerUrl: string | null;
  customLinks: CustomLink[];
  title: string;
}

const STORAGE_KEY = "streamify-global-sources";

export function LinkSelectorDialog({
  isOpen,
  onClose,
  onSelect,
  trailerUrl,
  customLinks,
  title,
}: LinkSelectorDialogProps) {
  const [globalSources, setGlobalSources] = useState<StreamingSource[]>([]);

  // Load global sources
  useEffect(() => {
    if (!isOpen) return;
    
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const sources = JSON.parse(saved);
        // Filter only enabled sources and exclude YouTube trailer
        setGlobalSources(
          sources.filter((s: StreamingSource) => s.enabled && s.id !== "yt-trailer")
        );
      } catch {
        setGlobalSources([]);
      }
    }
  }, [isOpen]);

  const handleGlobalSourceSelect = (source: StreamingSource) => {
  const searchQuery = encodeURIComponent(title);
  const streamUrl = `${source.baseUrl}`;
  
  // Apri nella stessa scheda
  window.location.href = streamUrl;
};

  if (!isOpen) return null;

  const totalSources = (trailerUrl ? 1 : 0) + globalSources.length + customLinks.length;

  return (
    <AnimatePresence>
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
          className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md"
        >
          {/* Header */}
          <div className="p-6 border-b border-border">
            <h3 className="text-xl font-bold text-foreground mb-2">
              Select Source
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose a source to play "{title}"
            </p>
          </div>

          {/* Content */}
          <ScrollArea className="max-h-[60vh]">
            <div className="p-6 space-y-3">
              {/* YouTube Trailer Option */}
              {trailerUrl && (
                <button
  onClick={() => {
    window.location.href = trailerUrl;
  }}
                  className="w-full flex items-center gap-4 p-4 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Youtube className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">YouTube Trailer</p>
                    <p className="text-xs text-muted-foreground">
                      Official trailer from YouTube
                    </p>
                  </div>
                  <Play className="w-5 h-5 text-muted-foreground" />
                </button>
              )}

              {/* Global Sources Section */}
              {globalSources.length > 0 && (
                <>
                  {(trailerUrl || customLinks.length > 0) && (
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground font-medium">
                          Global Sources
                        </span>
                      </div>
                    </div>
                  )}

                  {globalSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => handleGlobalSourceSelect(source)}
                      className="w-full flex items-center gap-4 p-4 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <ExternalLink className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{source.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {source.baseUrl}
                        </p>
                      </div>
                      <Play className="w-5 h-5 text-muted-foreground" />
                    </button>
                  ))}
                </>
              )}

              {/* Custom Links for this specific content */}
              {customLinks.length > 0 && (
                <>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground font-medium">
                        Custom Links
                      </span>
                    </div>
                  </div>

                  {customLinks.map((link, index) => (
                    <button
  onClick={() => {
    window.location.href = link.url;
  }}
                      className="w-full flex items-center gap-4 p-4 rounded-lg bg-secondary hover:bg-secondary/80 border border-border transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                        <LinkIcon className="w-5 h-5 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">
                          {link.label || `Custom Link ${index + 1}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {link.url}
                        </p>
                      </div>
                      <Play className="w-5 h-5 text-muted-foreground" />
                    </button>
                  ))}
                </>
              )}

              {/* Empty State */}
              {totalSources === 0 && (
                <div className="text-center py-12">
                  <ExternalLink className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-2 font-medium">No sources available</p>
                  <p className="text-sm text-muted-foreground">
                    Configure global sources in the Sources tab
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-6 border-t border-border">
            <Button
              variant="ghost"
              onClick={onClose}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
