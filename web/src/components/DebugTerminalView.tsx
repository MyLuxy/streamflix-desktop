"use client";

import { DebugTerminal } from "@/components/DebugTerminal";

// its own top-level browser window, not an overlay, so closing it just closes the window
export function DebugTerminalView() {
  return <DebugTerminal onClose={() => window.close()} />;
}
