import { useState, useEffect } from "react";
import { Plus, Trash2, ExternalLink, Link as LinkIcon, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface StreamingSource {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  addedAt: number;
}

const STORAGE_KEY = "streamify-global-sources";

export function SourcesPage() {
  const [sources, setSources] = useState<StreamingSource[]>([]);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  // Load sources from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSources(JSON.parse(saved));
      } catch {
        // Initialize with YouTube trailer as default
        const defaultSources: StreamingSource[] = [
          {
            id: "yt-trailer",
            name: "YouTube Trailer",
            baseUrl: "youtube",
            enabled: true,
            addedAt: Date.now(),
          },
        ];
        setSources(defaultSources);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSources));
      }
    } else {
      // Initialize with YouTube trailer as default
      const defaultSources: StreamingSource[] = [
        {
          id: "yt-trailer",
          name: "YouTube Trailer",
          baseUrl: "youtube",
          enabled: true,
          addedAt: Date.now(),
        },
      ];
      setSources(defaultSources);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSources));
    }
  }, []);

  // Save sources whenever they change
  const saveSources = (newSources: StreamingSource[]) => {
    setSources(newSources);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSources));
  };

  // Add new source
  const handleAddSource = () => {
    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();

    if (!trimmedName || !trimmedUrl) {
      toast.error("Please enter both name and URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    const newSource: StreamingSource = {
      id: `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: trimmedName,
      baseUrl: trimmedUrl,
      enabled: true,
      addedAt: Date.now(),
    };

    saveSources([...sources, newSource]);
    setNewName("");
    setNewUrl("");
    toast.success(`${trimmedName} added successfully`);
  };

  // Remove source
  const handleRemoveSource = (id: string) => {
    if (id === "yt-trailer") {
      toast.error("Cannot remove YouTube Trailer (default source)");
      return;
    }
    saveSources(sources.filter((s) => s.id !== id));
    toast.success("Source removed");
  };

  // Toggle source enabled/disabled
  const handleToggleSource = (id: string) => {
    if (id === "yt-trailer") {
      toast.error("Cannot disable YouTube Trailer (default source)");
      return;
    }
    saveSources(
      sources.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95 pt-20 md:pt-24 pb-24">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 gradient-featured bg-clip-text text-transparent">
            Streaming Sources
          </h1>
          <p className="text-muted-foreground text-lg">
            Configure global streaming sites. These will be available for all movies and TV shows.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="p-4 bg-card/50 backdrop-blur">
            <p className="text-sm text-muted-foreground mb-1">Total Sources</p>
            <p className="text-3xl font-bold text-foreground">{sources.length}</p>
          </Card>
          <Card className="p-4 bg-card/50 backdrop-blur">
            <p className="text-sm text-muted-foreground mb-1">Enabled</p>
            <p className="text-3xl font-bold text-primary">{enabledCount}</p>
          </Card>
        </div>

        {/* Add New Source Form */}
        <Card className="p-6 mb-8 bg-card/50 backdrop-blur border-primary/20">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Add New Source
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Source Name
              </label>
              <Input
                placeholder="e.g., StreamingCommunity, Altadefinizione..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full"
                onKeyDown={(e) => e.key === "Enter" && handleAddSource()}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Base URL
              </label>
              <Input
                placeholder="e.g., https://streamingcommunity.example"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full"
                onKeyDown={(e) => e.key === "Enter" && handleAddSource()}
              />
            </div>
            <Button onClick={handleAddSource} className="w-full gap-2" size="lg">
              <Plus className="w-4 h-4" />
              Add Source
            </Button>
          </div>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <LinkIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>How it works:</strong> Add the base URL of streaming sites. When you click
                Play on any movie/TV show, you'll be able to choose which source to use.
              </span>
            </p>
          </div>
        </Card>

        {/* Sources List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Your Sources</h2>
            <span className="text-sm text-muted-foreground">
              {sources.length} {sources.length === 1 ? "source" : "sources"} configured
            </span>
          </div>

          {sources.length === 0 ? (
            <Card className="p-12 text-center bg-card/30">
              <LinkIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-lg text-muted-foreground mb-2">No sources configured</p>
              <p className="text-sm text-muted-foreground">
                Add streaming sources above to get started
              </p>
            </Card>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {sources.map((source) => (
                  <Card
                    key={source.id}
                    className={`p-5 transition-all duration-200 ${
                      source.enabled
                        ? "bg-card/70 backdrop-blur border-primary/30"
                        : "bg-card/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggleSource(source.id)}
                        disabled={source.id === "yt-trailer"}
                        className={`flex-shrink-0 transition-colors ${
                          source.id === "yt-trailer" ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {source.enabled ? (
                          <ToggleRight className="w-8 h-8 text-primary" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                        )}
                      </button>

                      {/* Icon */}
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          source.enabled ? "bg-primary/20" : "bg-muted"
                        }`}
                      >
                        <ExternalLink
                          className={`w-6 h-6 ${
                            source.enabled ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg text-foreground mb-1">
                          {source.name}
                          {source.id === "yt-trailer" && (
                            <span className="ml-2 text-xs font-normal bg-primary/20 text-primary px-2 py-1 rounded">
                              Default
                            </span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate">{source.baseUrl}</span>
                        </div>
                      </div>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveSource(source.id)}
                        disabled={source.id === "yt-trailer"}
                        className={`text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0 ${
                          source.id === "yt-trailer" ? "opacity-30 cursor-not-allowed" : ""
                        }`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
