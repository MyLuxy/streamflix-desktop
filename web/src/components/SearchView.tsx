"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { SimplePageShell } from "@/components/SimplePageShell";
import { SearchPage, type SearchClickPayload } from "@/components/SearchPage";
import { useLocale } from "@/hooks/useLocale";
import { hrefForItem } from "@/lib/links";

export function SearchView() {
  const router = useRouter();
  const locale = useLocale();

  const handleClick = (payload: SearchClickPayload) => {
    if (payload.kind === "hentai") {
      const q = new URLSearchParams({ watch: payload.slug, n: payload.name });
      router.push(`/${locale}/category/hentai?${q.toString()}`);
      return;
    }
    router.push(hrefForItem(locale, payload.item));
  };

  return (
    <SimplePageShell>
      <Suspense fallback={null}>
        <SearchPage onItemClick={handleClick} />
      </Suspense>
    </SimplePageShell>
  );
}
