import type { Metadata } from "next";
import { SettingsView } from "@/components/SettingsView";

export const metadata: Metadata = {
  title: "Impostazioni",
  robots: { index: false, follow: true },
};

export default function ImpostazioniPage() {
  return <SettingsView />;
}
