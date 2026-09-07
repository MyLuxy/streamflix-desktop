"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const { startBackend, BACKEND_PORT } = require("./backend-manager");
const { startFrontend } = require("./frontend-manager");
const { createMainWindow } = require("./window");
const { initAutoUpdate } = require("./auto-update");

let children = [];
let mainWindow = null;

// only one copy of the app should ever run at once - two would both try to bind the
// same backend/frontend ports and fight over the same watch-progress/settings files
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

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

// same as killChildren, but resolves only once every process has actually exited - the
// updater needs this: it spawns the installer before Electron even starts quitting, so if
// backend.exe is still alive when NSIS tries to overwrite it, windows just leaves the old
// binary in place (a locked exe can't be replaced) and the update silently only half-applies
function killChildrenAndWait() {
  const toKill = children;
  children = [];
  return Promise.all(
    toKill.map((child) => {
      if (child.exitCode !== null || child.killed) return Promise.resolve();
      return new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
        }, 3000);
        // in case "exit" never fires for some reason, dont hang the update forever
        setTimeout(resolve, 4000);
      });
    })
  );
}

async function boot() {
  const logDir = app.getPath("logs");
  fs.mkdirSync(logDir, { recursive: true });

  // no File/Edit/View bar - this is a media app, not a document editor
  Menu.setApplicationMenu(null);

  const win = createMainWindow();
  mainWindow = win;

  try {
    const resDir = resourcesDir();
    const backend = await startBackend(resDir, logDir);
    children.push(backend.process);

    // the frontend bundle only ever knows about BACKEND_PORT (baked in at build time,
    // see copy-frontend.mjs) - if the backend actually ended up on a different port,
    // rewrite every request for the baked-in one before it leaves the renderer
    if (backend.port !== BACKEND_PORT) {
      win.webContents.session.webRequest.onBeforeRequest(
        { urls: [`http://127.0.0.1:${BACKEND_PORT}/*`] },
        (details, callback) => {
          callback({ redirectURL: details.url.replace(`:${BACKEND_PORT}/`, `:${backend.port}/`) });
        }
      );
    }

    const frontend = await startFrontend(resDir, logDir, backend.port);
    children.push(frontend.process);

    if (win.isDestroyed()) return;
    await win.loadURL(`http://127.0.0.1:${frontend.port}/`);

    initAutoUpdate(win, killChildrenAndWait);
  } catch (err) {
    dialog.showErrorBox(
      "StreamFlix failed to start",
      `${err.message}\n\nLogs: ${logDir}`
    );
    app.quit();
  }
}

if (gotSingleInstanceLock) {
  app.whenReady().then(boot);
}

app.on("window-all-closed", () => {
  killChildren();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", killChildren);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) boot();
});
