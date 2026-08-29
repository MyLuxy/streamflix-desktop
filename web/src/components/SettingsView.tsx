"use client";

import { SimplePageShell } from "@/components/SimplePageShell";
import { SettingsPage } from "@/components/SettingsPage";

export function SettingsView() {
  return (
    <SimplePageShell>
      <SettingsPage />
    </SimplePageShell>
  );
}
