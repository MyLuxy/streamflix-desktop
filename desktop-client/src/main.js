"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const { startBackend, BACKEND_PORT } = require("./backend-manager");
const { startFrontend } = require("./frontend-manager");
const { createMainWindow } = require("./window");
const { initAutoUpdate } = require("./auto-update");

let children = [];
let mainWindow = null;

// only one copy should ever run, two would fight over the same ports and progress files
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// module scope not inside boot(), boot() can rerun on macOS activate and handle() cant double-register
ipcMain.handle("streamflix:get-version", () => app.getVersion());

// only reveals paths under our own downloads dir, never an arbitrary renderer-supplied one
ipcMain.handle("streamflix:show-in-folder", (_event, filePath) => {
  const root = path.join(app.getPath("downloads"), "StreamFlix");
  if (!path.resolve(filePath).startsWith(root)) return;
  shell.showItemInFolder(filePath);
});

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

// same as killChildren but waits for real exit, the updater needs backend.exe truly gone before NSIS can overwrite it
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

  // no File/Edit/View bar, this is a media app, not a document editor
  Menu.setApplicationMenu(null);

  const win = createMainWindow();
  mainWindow = win;

  try {
    const resDir = resourcesDir();
    const downloadsDir = path.join(app.getPath("downloads"), "StreamFlix");
    fs.mkdirSync(downloadsDir, { recursive: true });
    const backend = await startBackend(resDir, logDir, downloadsDir);
    children.push(backend.process);

    // frontend only knows the baked-in BACKEND_PORT, rewrite requests if we landed on a different one
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
