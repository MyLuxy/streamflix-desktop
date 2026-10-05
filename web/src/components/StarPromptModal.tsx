"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";
import { WELCOME_STORAGE_KEY } from "@/components/WelcomeModal";
import { setStarPromptOpen } from "@/lib/star-prompt-lock";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REPO_URL = "https://github.com/MyLuxy/streamflix-desktop";
const STORAGE_KEY = "streamflix_star_prompt";
// sessionStorage survives the reload on language change, so that doesnt count as a new launch
const SESSION_KEY = "streamflix_star_prompt_session";

const MIN_LAUNCHES = 3;
const MIN_DAYS_INSTALLED = 3;
const SNOOZE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
// long enough for the startup update check to land first, an update always wins over this
const STARTUP_GRACE_MS = 20_000;
const POLL_MS = 5_000;

const ALLOWED_PAGES = ["watchlist", "downloads", "settings"];

// official mark from github's octicons (mark-github), lucide only ships a redrawn one
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

interface StarPromptStore {
  launches: number;
  firstLaunch: number;
  snoozeUntil: number;
  done: boolean;
}

function load(): StarPromptStore {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved === "object") return { launches: 0, firstLaunch: Date.now(), snoozeUntil: 0, done: false, ...saved };
  } catch {
    // corrupt or blocked storage, start over
  }
  return { launches: 0, firstLaunch: Date.now(), snoozeUntil: 0, done: false };
}

function save(store: StarPromptStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage blocked, worst case it asks again
  }
}

function countLaunch() {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    return;
  }
  const store = load();
  save({ ...store, launches: store.launches + 1 });
}

function isEligible(): boolean {
  try {
    if (localStorage.getItem(WELCOME_STORAGE_KEY) !== "true") return false;
  } catch {
    return false;
  }
  const store = load();
  const now = Date.now();
  return (
    !store.done &&
    store.launches >= MIN_LAUNCHES &&
    now - store.firstLaunch >= MIN_DAYS_INSTALLED * DAY_MS &&
    now >= store.snoozeUntil
  );
}

function isAllowedPage(pathname: string | null): boolean {
  const segments = (pathname ?? "").split("/").filter(Boolean);
  return segments.length === 1 || (segments.length === 2 && ALLOWED_PAGES.includes(segments[1]));
}

const mountedAt = Date.now();

// desktop only, asks for a github star once the app has been used for a while
export function StarPromptModal() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { isDesktop, state } = useDesktopUpdate();
  const [open, setOpen] = useState(false);
  const shownThisSession = useRef(false);
  const updateSeenThisSession = useRef(false);
  const answered = useRef(false);

  useEffect(() => {
    if (isDesktop) countLaunch();
  }, [isDesktop]);

  useEffect(() => {
    if (state.status !== "idle") updateSeenThisSession.current = true;
    if (!isDesktop || open || shownThisSession.current || updateSeenThisSession.current) return;
    if (!isAllowedPage(pathname) || !isEligible()) return;

    const timer = setInterval(() => {
      if (Date.now() - mountedAt < STARTUP_GRACE_MS) return;
      // the downloads page plays local files in an overlay, never interrupt that
      if (document.querySelector("video")) return;
      shownThisSession.current = true;
      setOpen(true);
      setStarPromptOpen(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isDesktop, pathname, state.status, open]);

  const finish = (outcome: "never" | "starred" | "later") => {
    const store = load();
    if (outcome === "later") save({ ...store, snoozeUntil: Date.now() + SNOOZE_DAYS * DAY_MS });
    else save({ ...store, done: true });
    setOpen(false);
    setStarPromptOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) return;
    // the buttons already saved their own answer, this only catches esc
    if (answered.current) return;
    finish("later");
  };

  const neverAsk = () => {
    answered.current = true;
    finish("never");
  };

  const giveStar = () => {
    answered.current = true;
    window.streamflixDesktop?.openExternal(REPO_URL);
    finish("starred");
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-4xl rounded-2xl bg-card border-border px-14 py-20 gap-8">
        <AlertDialogHeader className="space-y-4">
          <AlertDialogTitle className="flex items-center gap-5 text-foreground text-4xl">
            <Star className="w-14 h-14 fill-yellow-400 text-yellow-400 flex-shrink-0" />
            {t('starPrompt.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xl">{t('starPrompt.desc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-stretch gap-4">
          <AlertDialogCancel onClick={neverAsk} className="flex-1 h-16 text-xl hover:bg-secondary hover:text-foreground">
            {t('starPrompt.never')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={giveStar} className="flex-1 h-16 text-xl gap-2 [&_svg]:size-6">
            <GithubMark />
            {t('starPrompt.yes')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
