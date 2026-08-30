"use client";

import { Navigation } from "@/components/Navigation";

export function SimplePageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-20 md:pt-28 pb-24 px-4 md:px-8">{children}</main>
    </div>
  );
}
