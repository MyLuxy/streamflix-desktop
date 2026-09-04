"use client";

import { useState, useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { WelcomeModal } from "@/components/WelcomeModal";
import { UpdateNotifyModal } from "@/components/UpdateNotifyModal";
import { UpdateProvider } from "@/hooks/useDesktopUpdate";
import { DesktopTitleLock } from "@/components/DesktopTitleLock";
import { ScrollRestorer } from "@/components/ScrollRestorer";
import { createI18n } from "@/i18n";
import { recordPath } from "@/lib/nav-history";
import type { Locale } from "@/lib/i18n-config";

// tracks page changes so back nav can restore stuff like search state
function PathRecorder() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const qs = searchParams.toString();
    recordPath(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);
  return null;
}

export function Providers({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [i18n] = useState(() => createI18n(locale));

  // keeps i18n and the lang attr in sync if locale changes client side
  useEffect(() => {
    if (i18n.language !== locale) i18n.changeLanguage(locale);
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale, i18n]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <UpdateProvider>
            <Suspense fallback={null}>
              <PathRecorder />
              <ScrollRestorer />
            </Suspense>
            <WelcomeModal />
            <UpdateNotifyModal />
            <DesktopTitleLock />
            <Toaster />
            <Sonner />
            {children}
          </UpdateProvider>
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
