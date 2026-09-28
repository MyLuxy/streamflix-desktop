"use strict";

const { app, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

// re-checks while the app stays open for a long stretch, not just on launch
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let initialized = false;

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
    send(win, { type: "error", message: err?.message ?? String(err) });
  });

  ipcMain.handle("streamflix:check-for-updates", () => {
    autoUpdater.checkForUpdates().catch(() => {});
  });

  ipcMain.handle("streamflix:download-update", () => {
    autoUpdater.downloadUpdate().catch(() => {});
  });

  ipcMain.handle("streamflix:quit-and-install", async () => {
    // quitAndInstall spawns NSIS before electron even quits, so backend.exe must be dead first
    await killChildrenAndWait();
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, RECHECK_INTERVAL_MS);
}

module.exports = { initAutoUpdate };
