"use strict";

const { app, ipcMain, session } = require("electron");
const { autoUpdater } = require("electron-updater");

// re-checks while the app stays open for a long stretch, not just on launch
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const GITHUB_FEED = { provider: "github", owner: "MyLuxy", repo: "streamflix-desktop", channel: "updates" };

// mirror on our own vps so installs keep updating even if the repo goes away
const VPS_HOST = "207.180.196.99";
// self-signed cert for a bare ip, so we trust exactly this one instead of any CA
const VPS_CERT_PIN = "sha256/yTDh08swm8Hy0MRrlU4X/QRKQyaOPNT27/0Fh7dOJuI=";
const VPS_FEED = {
  provider: "generic",
  url: `https://${VPS_HOST}:8443/${process.env.STREAMFLIX_UPDATE_FEED === "staging" ? "staging" : "stable"}`,
  channel: "updates",
};
const FORCE_VPS = process.env.STREAMFLIX_UPDATE_FORCE_FALLBACK === "1";

let initialized = false;
let onVps = false;
// check()/download() report their own error once both feeds failed, the raw event would fire per attempt
let busy = false;

// the page reloads on language change and would lose the one-time events below, so it asks for this on load
let lastState = null;

function remember(payload) {
  if (payload.type === "available" || payload.type === "downloaded") {
    lastState = payload;
  } else if (payload.type === "progress") {
    lastState = { type: "progress", version: lastState?.version, percent: payload.percent };
  } else if (payload.type === "not-available" && lastState?.type === "available") {
    // release pulled from the feed. a downloaded/downloading update stays, same as the page ignoring this event
    lastState = null;
  } else if (payload.type === "error" && lastState?.type === "progress") {
    // download broke, fall back to "available" so the user can retry after a reload too
    lastState = { type: "available", version: lastState.version };
  }
}

// module scope so it exists in dev too, where initAutoUpdate bails out early and this just returns null
ipcMain.handle("streamflix:get-update-state", () => lastState);

function send(win, payload) {
  remember(payload);
  if (win.isDestroyed()) return;
  win.webContents.send("streamflix:update-event", payload);
}

function pinVpsCert() {
  // same partition + options electron-updater uses for its own requests, so this only touches update traffic
  session.fromPartition("electron-updater", { cache: false }).setCertificateVerifyProc((req, callback) => {
    if (req.hostname !== VPS_HOST) return callback(-3);
    callback(req.certificate.fingerprint === VPS_CERT_PIN ? 0 : -2);
  });
}

function useFeed(vps) {
  autoUpdater.setFeedURL(vps ? VPS_FEED : GITHUB_FEED);
  onVps = vps;
}

// github first every time, the vps only when github itself fails
async function check(win) {
  busy = true;
  try {
    if (!FORCE_VPS) {
      try {
        useFeed(false);
        await autoUpdater.checkForUpdates();
        return;
      } catch {}
    }
    useFeed(true);
    await autoUpdater.checkForUpdates();
  } catch (err) {
    send(win, { type: "error", message: err?.message ?? String(err) });
  } finally {
    busy = false;
  }
}

async function download(win) {
  busy = true;
  try {
    try {
      await autoUpdater.downloadUpdate();
      return;
    } catch (err) {
      if (onVps) throw err;
    }
    // github answered the check but the installer download failed, the vps needs its own check first
    useFeed(true);
    await autoUpdater.checkForUpdates();
    await autoUpdater.downloadUpdate();
  } catch (err) {
    send(win, { type: "error", message: err?.message ?? String(err) });
  } finally {
    busy = false;
  }
}

// user-driven only, we never auto download/install, renderer decides via the ipc handlers below
function initAutoUpdate(win, killChildrenAndWait) {
  if (!app.isPackaged) return; // no update feed in dev, checking would just error
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    send(win, { type: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    send(win, { type: "not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    send(win, { type: "progress", percent: progress.percent });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send(win, { type: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    if (busy) return;
    send(win, { type: "error", message: err?.message ?? String(err) });
  });

  ipcMain.handle("streamflix:check-for-updates", () => {
    if (!busy) check(win);
  });

  ipcMain.handle("streamflix:download-update", () => {
    if (!busy) download(win);
  });

  ipcMain.handle("streamflix:quit-and-install", async () => {
    // quitAndInstall spawns NSIS before electron even quits, so backend.exe must be dead first
    await killChildrenAndWait();
    autoUpdater.quitAndInstall();
  });

  pinVpsCert();
  check(win);
  // skipped mid download, switching feeds under a running download isnt worth the risk
  setInterval(() => {
    if (!busy) check(win);
  }, RECHECK_INTERVAL_MS);
}

module.exports = { initAutoUpdate };
