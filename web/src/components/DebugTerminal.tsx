"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Trash2, TerminalSquare, Save, ListChecks, ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BACKEND_URL } from "@/lib/backend";

interface DebugEvent {
  id: number;
  timestamp: number;
  level: "info" | "success" | "warn" | "error";
  category: string;
  message: string;
}

interface DebugTerminalProps {
  onClose: () => void;
}

const LEVEL_STYLES: Record<DebugEvent["level"], string> = {
  info: "text-sky-400",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

const CATEGORY_STYLES: Record<string, string> = {
  http: "bg-zinc-700 text-zinc-300",
  stream: "bg-indigo-900 text-indigo-300",
  download: "bg-fuchsia-900 text-fuchsia-300",
  providercheck: "bg-teal-900 text-teal-300",
  cmd: "bg-violet-900 text-violet-300",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatLogFile(events: DebugEvent[]): string {
  return events
    .map((e) => `[${new Date(e.timestamp).toISOString()}] [${e.level.toUpperCase()}] [${e.category}] ${e.message}`)
    .join("\n");
}

const MAX_LINES = 500;
// how close to the bottom (in px) still counts as "following" the live output
const STICKY_THRESHOLD = 80;

export function DebugTerminal({ onClose }: DebugTerminalProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [checkingProviders, setCheckingProviders] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  // ids are monotonic, a reconnect replays the backend's backlog and this skips whatever it already showed
  const lastIdRef = useRef(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(0);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // a real ctrl+c copies a selection like any app, only steal it when nothing is selected
      if (e.ctrlKey && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
        e.preventDefault();
        fetch(`${BACKEND_URL}/api/debug/cancel`, { method: "POST" }).catch(() => {});
        return;
      }
      // typing right after selecting some log text shouldnt need an extra click back into the prompt first
      if (!menuOpenRef.current && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const source = new EventSource(`${BACKEND_URL}/api/debug/stream`);
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as DebugEvent;
      if (event.id <= lastIdRef.current) return;
      lastIdRef.current = event.id;
      if (event.category === "providercheck" && (event.message.startsWith("done:") || event.message.startsWith("cancelled"))) {
        setCheckingProviders(false);
      }
      // check the live scroll position right as each line arrives, not from a separate scroll listener that a resize can desync
      const el = scrollRef.current;
      if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD;
      setEvents((prev) => {
        const next = [...prev, event];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setShowJumpToBottom(!stickToBottomRef.current);
  }, [events]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowJumpToBottom(el.scrollHeight - el.scrollTop - el.clientHeight >= STICKY_THRESHOLD);
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJumpToBottom(false);
  };

  // deferred a tick so a double/triple click finishes selecting its word/line before this steals focus
  const handleContainerMouseUp = () => {
    setTimeout(() => {
      if (window.getSelection()?.toString()) return;
      inputRef.current?.focus();
    }, 0);
  };

  const handleSaveLog = async () => {
    const text = formatLogFile(events);
    if (window.streamflixDesktop) {
      await window.streamflixDesktop.saveDebugLog(text);
      return;
    }
    // plain browser fallback for the web/dev build, no native save dialog available there
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `streamflix-debug-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCheckProviders = async () => {
    setCheckingProviders(true);
    const res = await fetch(`${BACKEND_URL}/api/debug/check-providers`, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) setCheckingProviders(false);
  };

  const runCommand = (raw: string) => {
    const command = raw.trim();
    if (!command) return;
    historyRef.current.push(command);
    historyIndexRef.current = historyRef.current.length;
    if (command.toLowerCase() === "clear") {
      setEvents([]);
      return;
    }
    if (command.toLowerCase() === "check-providers") {
      handleCheckProviders();
      return;
    }
    fetch(`${BACKEND_URL}/api/debug/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    }).catch(() => {});
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      runCommand(input);
      setInput("");
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndexRef.current > 0) historyIndexRef.current--;
      setInput(historyRef.current[historyIndexRef.current] ?? "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndexRef.current < historyRef.current.length) historyIndexRef.current++;
      setInput(historyRef.current[historyIndexRef.current] ?? "");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col font-mono">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-800 flex-shrink-0 bg-zinc-950">
        <div className="flex items-center gap-3 min-w-0">
          <TerminalSquare className="w-6 h-6 text-white flex-shrink-0" />
          <p className="text-lg sm:text-xl font-semibold text-zinc-100 truncate">{t("debugTerminal.title")}</p>
        </div>
        <DropdownMenu onOpenChange={(open) => (menuOpenRef.current = open)}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex-shrink-0 [&_svg]:size-6 focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[110] min-w-[11rem] p-2 bg-zinc-900 border-zinc-800">
            <DropdownMenuItem
              onClick={() => setEvents([])}
              className="text-base py-2.5 px-3 cursor-pointer text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100"
            >
              <Trash2 className="w-4 h-4 mr-2.5" />
              {t("debugTerminal.clear")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleSaveLog}
              className="text-base py-2.5 px-3 cursor-pointer text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100"
            >
              <Save className="w-4 h-4 mr-2.5" />
              {t("debugTerminal.save")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={checkingProviders}
              onClick={handleCheckProviders}
              className="text-base py-2.5 px-3 cursor-pointer text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100 data-[disabled]:opacity-50"
            >
              <ListChecks className="w-4 h-4 mr-2.5" />
              {checkingProviders ? t("debugTerminal.checkingProviders") : t("debugTerminal.checkProviders")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 min-h-0 flex flex-col" onMouseUp={handleContainerMouseUp}>
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            // bright text on pure black otherwise shows a glow at repaint tile edges while scrolling, a stable gpu layer avoids it
            className="debug-scrollbar h-full overflow-y-auto px-4 sm:px-6 py-4 text-xs sm:text-sm leading-relaxed select-text transform-gpu will-change-transform"
          >
            {events.length === 0 ? (
              <p className="text-zinc-600">{t("debugTerminal.waiting")}</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="flex gap-2 sm:gap-3 py-0.5 rounded px-1 -mx-1">
                  <span className="text-zinc-600 flex-shrink-0">{formatTime(event.timestamp)}</span>
                  <span
                    className={`flex-shrink-0 px-1.5 rounded text-[10px] sm:text-xs uppercase tracking-wide self-start mt-0.5 ${
                      CATEGORY_STYLES[event.category] ?? "bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {event.category}
                  </span>
                  <span className={`break-all ${LEVEL_STYLES[event.level] ?? "text-zinc-300"}`}>{event.message}</span>
                </div>
              ))
            )}
          </div>

          {showJumpToBottom && (
            <Button
              onClick={jumpToBottom}
              size="sm"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 gap-1.5 rounded-full bg-zinc-800 text-zinc-100 hover:bg-zinc-700 shadow-lg"
            >
              <ArrowDown className="w-4 h-4" />
              {t("debugTerminal.jumpToBottom")}
            </Button>
          )}
        </div>

        {checkingProviders && (
          <div className="px-4 sm:px-6 py-1.5 text-xs text-amber-400 border-t border-zinc-800 bg-zinc-900/60 flex-shrink-0">
            {t("debugTerminal.runningHint")}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-t border-zinc-800 flex-shrink-0 bg-zinc-950">
          <span className="text-emerald-400 flex-shrink-0">$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t("debugTerminal.commandPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-zinc-100 text-sm placeholder:text-zinc-600 outline-none caret-emerald-400"
          />
        </div>
      </div>
    </div>
  );
}
