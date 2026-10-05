"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";
import { useStarPromptOpen } from "@/lib/star-prompt-lock";
import { useLocale } from "@/hooks/useLocale";
import { localePath } from "@/lib/links";
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

// dismissal lives in sessionStorage, changing language reloads the whole page so plain state wouldnt survive it
const DISMISSED_KEY = "streamflix_update_modal_dismissed";

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// shows once per session for a freshly-available update, doesnt nag once downloading starts
export function UpdateNotifyModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const { isDesktop, state } = useDesktopUpdate();
  const [open, setOpen] = useState(false);
  const starPromptOpen = useStarPromptOpen();

  useEffect(() => {
    if (!isDesktop || state.status !== "available" || open || starPromptOpen || wasDismissed()) return;
    const timer = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(timer);
  }, [isDesktop, state.status, open, starPromptOpen]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      try {
        sessionStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // storage blocked, worst case it shows again next load
      }
    }
  };

  const goToSettings = () => {
    router.push(localePath(locale, "/settings"));
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-4xl rounded-2xl bg-card border-border px-14 py-20 gap-8">
        <AlertDialogHeader className="space-y-4">
          <AlertDialogTitle className="flex items-center gap-5 text-foreground text-4xl">
            <Download className="w-14 h-14 text-primary flex-shrink-0" />
            {t('settings.updateAvailableTitle', { version: state.version })}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xl">{t('settings.updateModalDesc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-stretch gap-4">
          <AlertDialogCancel className="flex-1 h-16 text-xl hover:bg-secondary hover:text-foreground">
            {t('settings.updateNotNow')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={goToSettings} className="flex-1 h-16 text-xl gap-2 [&_svg]:size-6">
            <Download />
            {t('settings.updateGoUpdate')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
