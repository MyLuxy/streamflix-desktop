const KEY = "streamflix_discord_presence";

// on by default, only an explicit "off" turns it off
export function isDiscordPresenceEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setDiscordPresenceEnabled(enabled: boolean) {
  try {
    localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    // storage blocked, the toggle just wont persist
  }
  if (!enabled) window.streamflixDesktop?.clearPresence().catch(() => {});
}
