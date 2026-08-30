"use strict";

const { BrowserWindow } = require("electron");
const path = require("node:path");

const LOADING_HTML = `data:text/html,${encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{height:100%;margin:0;background:#0a0a0a;color:#eee;font-family:system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center}
  p{opacity:.7;font-size:14px}
</style></head><body><p>Starting StreamFlix...</p></body></html>`)}`;

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadURL(LOADING_HTML);
  return win;
}

module.exports = { createMainWindow };
