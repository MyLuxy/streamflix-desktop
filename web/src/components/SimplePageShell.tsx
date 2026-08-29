"use client";

import { Navigation } from "@/components/Navigation";

// Shell comune per le pagine secondarie (ricerca/watchlist/impostazioni):
// navbar fissa + contenuto con padding-top per non finire sotto la navbar.
export function SimplePageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-20 md:pt-28 pb-24 px-4 md:px-8">{children}</main>
    </div>
  );
}
