"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isDiscordPresenceEnabled, PRESENCE_CHANGED_EVENT } from "@/lib/discord-presence";

// keeps "browsing StreamFlix" on the discord profile while nothing is playing, the player takes over while it is
export function DiscordIdlePresence() {
  const { t } = useTranslation();

  useEffect(() => {
    const bridge = window.streamflixDesktop;
    if (!bridge) return;

    const sync = () => {
      bridge.setIdlePresence(isDiscordPresenceEnabled() ? t("settings.presenceBrowsing") : null).catch(() => {});
    };
    sync();
    window.addEventListener(PRESENCE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PRESENCE_CHANGED_EVENT, sync);
  }, [t]);

  return null;
}
