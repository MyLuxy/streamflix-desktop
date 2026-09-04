"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// narrow, purpose-built bridge for the update flow (plus the app version, shown in settings) -
// nothing else from Electron/Node is exposed to the loaded page. the web app checks for
// window.streamflixDesktop to know it's running inside the desktop shell at all (absent in
// the plain browser/dev server)
contextBridge.exposeInMainWorld("streamflixDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("streamflix:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("streamflix:download-update"),
  quitAndInstall: () => ipcRenderer.invoke("streamflix:quit-and-install"),
  getVersion: () => ipcRenderer.invoke("streamflix:get-version"),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("streamflix:update-event", listener);
    return () => ipcRenderer.removeListener("streamflix:update-event", listener);
  },
});
