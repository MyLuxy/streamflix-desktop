"use client";

import { usePathname } from "next/navigation";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n-config";

// Ricava il locale corrente dal primo segmento dell'URL (/it/..., /en/...).
export function useLocale(): Locale {
  const pathname = usePathname();
  const seg = pathname.split("/")[1];
  return isLocale(seg) ? seg : defaultLocale;
}
