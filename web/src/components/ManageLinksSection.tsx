import { useState } from "react";
import { Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomLinks } from "@/hooks/useCustomLinks";
import { toast } from "sonner";

interface ManageLinksSectionProps {
  id: number;
  mediaType: "movie" | "tv";
}

export function ManageLinksSection({ id, mediaType }: ManageLinksSectionProps) {
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const { getLinks, addLink, removeLink } = useCustomLinks();

  const links = getLinks(id, mediaType);

  const handleAddLink = () => {
    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl) {
      toast.error("Please enter a URL");
      return;
    }

    try {
      new URL(trimmedUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    addLink(id, mediaType, trimmedUrl, newLabel.trim() || undefined);
    setNewUrl("");
    setNewLabel("");
    toast.success("Link added successfully");
  };

  const handleRemoveLink = (linkId: string) => {
    removeLink(id, mediaType, linkId);
    toast.success("Link removed");
  };

  return (
    <div className="border-t border-border pt-6 mt-6">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <LinkIcon className="w-4 h-4" />
        Manage Streaming Links
      </h3>

      <div className="space-y-3 mb-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter streaming URL..."
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAddLink} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Link
          </Button>
        </div>
      </div>

      {links.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-2">
            Custom Sources ({links.length})
          </p>
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-3 bg-secondary rounded-lg p-3"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <LinkIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {link.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {link.url}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveLink(link.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {links.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4 bg-secondary/50 rounded-lg">
          No custom links added. YouTube trailer will be used by default.
        </p>
      )}
    </div>
  );
}
