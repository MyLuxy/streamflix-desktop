"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { HentaiCard } from "./HentaiCard";
import type { HentaiItem } from "@/lib/hentai";

interface HentaiRowProps {
  title: string;
  items: HentaiItem[];
  onPlay?: (item: HentaiItem) => void;
}

export function HentaiRow({ title, items, onPlay }: HentaiRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const check = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="py-4 group/row"
    >
      <h2 className="text-xl md:text-2xl font-bold text-foreground mb-4 px-6 md:px-10 select-none">
        {title}
      </h2>

      <div className="relative">
        <button
          onClick={() => scroll("left")}
          className={`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm p-3 rounded-full shadow-lg transition-all duration-300 hover:bg-background/90 hover:scale-110 ${
            canLeft ? "opacity-0 group-hover/row:opacity-100" : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-7 h-7 -translate-x-px" />
        </button>
        <button
          onClick={() => scroll("right")}
          className={`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm p-3 rounded-full shadow-lg transition-all duration-300 hover:bg-background/90 hover:scale-110 ${
            canRight ? "opacity-0 group-hover/row:opacity-100" : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll right"
        >
          <ChevronRight className="w-7 h-7 translate-x-px" />
        </button>

        <div
          ref={scrollRef}
          onScroll={check}
          className="flex items-start gap-3 px-6 md:px-10 overflow-x-auto scrollbar-hide scroll-smooth"
        >
          {items.map((item) => (
            <HentaiCard key={item.id} item={item} onPlay={onPlay} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
