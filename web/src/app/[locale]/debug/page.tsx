import type { Metadata } from "next";
import { DebugTerminalView } from "@/components/DebugTerminalView";

export const metadata: Metadata = {
  title: "Debug",
  robots: { index: false, follow: true },
};

export default function DebugPageRoute() {
  return <DebugTerminalView />;
}
