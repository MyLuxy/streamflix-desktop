"use strict";

const { app, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

// re-checks while the app stays open for a long stretch, not just on launch
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let initialized = false;

function send(win, payload) {
  if (win.isDestroyed()) return;
  win.webContents.send("streamflix:update-event", payload);
}

// user-driven only: we never download or install on our own, the renderer decides when to
// call checkForUpdates/downloadUpdate/quitAndInstall via the ipc handlers below
function initAutoUpdate(win) {
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

  ipcMain.handle("streamflix:quit-and-install", () => {
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, RECHECK_INTERVAL_MS);
}

module.exports = { initAutoUpdate };
