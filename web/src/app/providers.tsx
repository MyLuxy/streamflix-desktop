"use client";

import { useState, useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { WelcomeModal } from "@/components/WelcomeModal";
import { ScrollRestorer } from "@/components/ScrollRestorer";
import { createI18n } from "@/i18n";
import { recordPath } from "@/lib/nav-history";
import type { Locale } from "@/lib/i18n-config";

// Registra ogni cambio di pagina (query inclusa) per il "Torna indietro"
// affidabile, così tornando da una scheda si ripristina la ricerca fatta.
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
  // Istanza i18n inizializzata sul locale dell'URL (server e client coincidono)
  const [i18n] = useState(() => createI18n(locale));

  // Se si naviga tra lingue lato client, allinea l'istanza e l'attributo lang
  useEffect(() => {
    if (i18n.language !== locale) i18n.changeLanguage(locale);
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale, i18n]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <Suspense fallback={null}>
            <PathRecorder />
            <ScrollRestorer />
          </Suspense>
          <WelcomeModal />
          <Toaster />
          <Sonner />
          {children}
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
