import type { Metadata } from "next";
import { SearchView } from "@/components/SearchView";

export const metadata: Metadata = {
  title: "Cerca film e serie TV",
  description: "Cerca tra migliaia di film e serie TV in streaming.",
  robots: { index: false, follow: true },
};

export default function CercaPage() {
  return <SearchView />;
}
