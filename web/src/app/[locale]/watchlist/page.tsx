import type { Metadata } from "next";
import { WatchlistView } from "@/components/WatchlistView";

export const metadata: Metadata = {
  title: "La mia lista",
  robots: { index: false, follow: true },
};

export default function WatchlistPageRoute() {
  return <WatchlistView />;
}
