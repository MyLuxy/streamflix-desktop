"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";
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

// shows once per app session, a couple seconds after launch, only for a freshly-available
// update - doesn't nag again while downloading/downloaded, that's what settings is for
export function UpdateNotifyModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const { isDesktop, state } = useDesktopUpdate();
  const [open, setOpen] = useState(false);
  const [alreadyShown, setAlreadyShown] = useState(false);

  useEffect(() => {
    if (!isDesktop || state.status !== "available" || alreadyShown) return;
    const timer = setTimeout(() => {
      setOpen(true);
      setAlreadyShown(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isDesktop, state.status, alreadyShown]);

  const goToSettings = () => {
    router.push(localePath(locale, "/settings"));
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
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
