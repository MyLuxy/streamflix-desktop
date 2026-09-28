"use strict";

const { app, ipcMain } = require("electron");
const { Client } = require("@xhayper/discord-rpc");

// public id of the StreamFlix application in the Discord developer portal, not a secret
const CLIENT_ID = "1554118394893180988";
const RELEASES_URL = "https://github.com/MyLuxy/streamflix-desktop/releases/latest";
// discord accepts a public image url in place of an uploaded art asset, so nothing has to be uploaded in the portal
const LOGO_URL = "https://raw.githubusercontent.com/MyLuxy/streamflix-desktop/main/desktop-client/assets/icon.png";
const WATCHING = 3;
// status text shows the "details" line (the title) instead of the app name
const STATUS_DISPLAY_DETAILS = 2;

const RETRY_MS = 30_000;
// discord drops updates past ~5 per 20s
const MIN_INTERVAL_MS = 4_000;

let client = null;
let connected = false;
let connecting = false;
let hasPending = false;
// latest activity waiting to go out, null means "clear"
let pending = null;
let lastSentAt = 0;
// what is on screen right now wins, the idle "browsing" one is what shows when nothing is playing
let watching = null;
let idle = null;
// measured here, not in the page, so the elapsed time survives the page reloading on a language change
const startedAt = Date.now();
let flushTimer = null;
let retryTimer = null;

function text(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 128);
  // discord rejects strings shorter than 2 chars
  return trimmed ? trimmed.padEnd(2, " ") : undefined;
}

function buildActivity(payload) {
  if (!payload || typeof payload !== "object") return null;
  const details = text(payload.details);
  if (!details) return null;

  const poster = typeof payload.posterUrl === "string" && payload.posterUrl.startsWith("https://") && payload.posterUrl.length <= 256
    ? payload.posterUrl
    : null;
  const paused = payload.paused === true;

  const activity = {
    type: WATCHING,
    statusDisplayType: STATUS_DISPLAY_DETAILS,
    details,
    state: text(payload.state),
    largeImageKey: poster ?? LOGO_URL,
    largeImageText: details,
    buttons: [{ label: "Download StreamFlix", url: RELEASES_URL }],
  };

  // the big image is the poster when there is one, so the logo moves to the corner
  if (poster) {
    activity.smallImageKey = LOGO_URL;
    activity.smallImageText = "StreamFlix";
  }

  if (!paused && Number.isFinite(payload.startTimestamp)) {
    activity.startTimestamp = Math.round(payload.startTimestamp);
    if (Number.isFinite(payload.endTimestamp) && payload.endTimestamp > payload.startTimestamp) {
      activity.endTimestamp = Math.round(payload.endTimestamp);
    }
  }
  return activity;
}

function buildIdle(state) {
  const label = text(state);
  if (!label) return null;
  return {
    type: WATCHING,
    statusDisplayType: STATUS_DISPLAY_DETAILS,
    details: "StreamFlix",
    state: label,
    largeImageKey: LOGO_URL,
    largeImageText: "StreamFlix",
    startTimestamp: startedAt,
    buttons: [{ label: "Download StreamFlix", url: RELEASES_URL }],
  };
}

function scheduleRetry() {
  if (retryTimer || !pending) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, RETRY_MS);
  retryTimer.unref?.();
}

function connect() {
  if (connected || connecting) return;
  connecting = true;

  const rpc = new Client({ clientId: CLIENT_ID });
  client = rpc;

  rpc.on("ready", () => {
    connecting = false;
    connected = true;
    flush();
  });
  // discord closed or restarted, pick the connection back up if there is still something to show
  rpc.on("disconnected", () => {
    connected = false;
    connecting = false;
    client = null;
    // discord forgets the activity on disconnect, so whatever is current has to go out again
    hasPending = pending !== null;
    scheduleRetry();
  });

  rpc.login().catch(() => {
    // discord isnt running, nothing to do until it is
    connecting = false;
    client = null;
    scheduleRetry();
  });
}

function flush() {
  if (!connected || !client?.user || !hasPending) return;

  const wait = MIN_INTERVAL_MS - (Date.now() - lastSentAt);
  if (wait > 0) {
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, wait);
      flushTimer.unref?.();
    }
    return;
  }

  const activity = pending;
  hasPending = false;
  lastSentAt = Date.now();
  const send = activity ? client.user.setActivity(activity) : client.user.clearActivity();
  Promise.resolve(send).catch(() => {});
}

function refresh() {
  pending = watching ?? idle;
  hasPending = true;
  if (pending) connect();
  flush();
}

// module scope so the handlers exist for the whole app lifetime, main.js just requires this file
ipcMain.handle("streamflix:presence-set", (_event, payload) => {
  watching = buildActivity(payload);
  refresh();
});
// back to the idle one if it is on, otherwise nothing is shown
ipcMain.handle("streamflix:presence-clear", () => {
  watching = null;
  refresh();
});
ipcMain.handle("streamflix:presence-idle", (_event, state) => {
  idle = buildIdle(state);
  refresh();
});

app.on("before-quit", () => {
  clearTimeout(flushTimer);
  clearTimeout(retryTimer);
  Promise.resolve(client?.destroy?.()).catch(() => {});
});
