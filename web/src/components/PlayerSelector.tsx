import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Play } from "lucide-react";

interface Player {
  id: string;
  label: string;
  icon: string;
}

interface PlayerSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (playerId: string) => void;
  title: string;
}

const players: Player[] = [
  { id: "player6", label: "Player 1 (Videasy)", icon: "▶️" },
  { id: "player1", label: "Player 2 (VixSrc)", icon: "▶️" },
  { id: "player2", label: "Player 3 (VidSrc)", icon: "▶️" },
  { id: "player7", label: "Player 4 (Vidlink)", icon: "▶️" },
];

export function PlayerSelector({
  isOpen,
  onClose,
  onSelect,
  title,
}: PlayerSelectorProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

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
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md"
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">
                Select Player
              </h3>
              <p className="text-sm text-muted-foreground truncate max-w-[220px]">
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

        {/* Player List */}
        <div className="p-6 space-y-3">
          {players.map((player) => (
            <button
              key={player.id}
              onClick={() => onSelect(player.id)}
              className="w-full flex items-center gap-4 p-4 rounded-lg bg-secondary hover:bg-primary/10 border border-border hover:border-primary transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/40 transition-colors">
                <Play className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">
                  {player.label}
                </p>
              </div>
              <div className="text-muted-foreground group-hover:text-primary transition-colors">
                →
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
           ⚠️ If a player doesn't work, try another one.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}