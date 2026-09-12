"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// narrow bridge, just the update flow and app version, page checks window.streamflixDesktop to know it's desktop
contextBridge.exposeInMainWorld("streamflixDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("streamflix:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("streamflix:download-update"),
  quitAndInstall: () => ipcRenderer.invoke("streamflix:quit-and-install"),
  getVersion: () => ipcRenderer.invoke("streamflix:get-version"),
  showInFolder: (filePath) => ipcRenderer.invoke("streamflix:show-in-folder", filePath),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("streamflix:update-event", listener);
    return () => ipcRenderer.removeListener("streamflix:update-event", listener);
  },
});
