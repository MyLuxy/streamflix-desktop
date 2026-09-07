import type { Metadata } from "next";
import { DownloadsView } from "@/components/DownloadsView";

export const metadata: Metadata = {
  title: "Download",
  robots: { index: false, follow: true },
};

export default function DownloadsPageRoute() {
  return <DownloadsView />;
}
