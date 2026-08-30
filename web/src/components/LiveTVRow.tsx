import { ChevronLeft, ChevronRight, Tv } from "lucide-react";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { liveChannels, LiveChannel } from "@/data/liveChannels";

export function LiveTVRow() {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;

    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    const newScrollLeft =
      scrollRef.current.scrollLeft +
      (direction === "right" ? scrollAmount : -scrollAmount);

    scrollRef.current.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  };

  const handleChannelClick = (channel: LiveChannel) => {
    window.open(channel.url, '_blank', 'noopener,noreferrer');
  };

  if (liveChannels.length === 0) return null;

  return (
    <div className="relative group py-4 hidden">
      <h2 className="text-xl font-bold text-foreground mb-4 px-4 md:px-8 flex items-center gap-2">
        <Tv className="w-5 h-5 text-primary" />
        Live TV
      </h2>

      {showLeftArrow && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-full w-12 rounded-none bg-gradient-to-r from-background via-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 md:px-8 scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {liveChannels.map((channel) => (
          <motion.button
            key={channel.id}
            onClick={() => handleChannelClick(channel)}
            className="relative flex-shrink-0 w-48 h-28 rounded-lg overflow-hidden bg-secondary/50 border border-border hover:border-primary transition-all duration-300 group/card"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <img
                src={channel.logo}
                alt={channel.name}
                className="w-full h-full object-contain filter brightness-90 group-hover/card:brightness-100 transition-all"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100">
                <span className="text-sm font-semibold text-foreground text-center px-2">
                  {channel.name}
                </span>
              </div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />

            <div className="absolute top-2 right-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity">
              <p className="text-xs font-semibold text-white text-center truncate">
                {channel.name}
              </p>
              <p className="text-xs text-gray-300 text-center">
                {channel.provider === 'pluto' ? 'Pluto TV' : 'USTVGO'}
              </p>
            </div>

            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
                <Tv className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {showRightArrow && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-full w-12 rounded-none bg-gradient-to-l from-background via-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="w-8 h-8" />
        </Button>
      )}
    </div>
  );
}
