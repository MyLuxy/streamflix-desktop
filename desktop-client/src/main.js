"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const { startBackend } = require("./backend-manager");
const { startFrontend } = require("./frontend-manager");
const { createMainWindow } = require("./window");
const { initAutoUpdate } = require("./auto-update");

let children = [];

// registered once at module scope, not inside boot() - boot() can run again on macOS
// "activate" and ipcMain.handle throws if the same channel is registered twice
ipcMain.handle("streamflix:get-version", () => app.getVersion());

function resourcesDir() {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, "..", "resources");
}

function killChildren() {
  for (const child of children) {
    if (child.exitCode !== null || child.killed) continue;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
    }, 3000);
  }
  children = [];
}

async function boot() {
  const logDir = app.getPath("logs");
  fs.mkdirSync(logDir, { recursive: true });

  // no File/Edit/View bar - this is a media app, not a document editor
  Menu.setApplicationMenu(null);

  const win = createMainWindow();

  try {
    const resDir = resourcesDir();
    const backend = await startBackend(resDir, logDir);
    children.push(backend.process);

    const frontend = await startFrontend(resDir, logDir);
    children.push(frontend.process);

    if (win.isDestroyed()) return;
    await win.loadURL(`http://127.0.0.1:${frontend.port}/`);

    initAutoUpdate(win);
  } catch (err) {
    dialog.showErrorBox(
      "StreamFlix failed to start",
      `${err.message}\n\nLogs: ${logDir}`
    );
    app.quit();
  }
}

app.whenReady().then(boot);

app.on("window-all-closed", () => {
  killChildren();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", killChildren);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) boot();
});
