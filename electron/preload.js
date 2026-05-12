const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storage", {
  get: (key) => ipcRenderer.invoke("storage-get", key),
  set: (key, value) => ipcRenderer.invoke("storage-set", key, value),
});

contextBridge.exposeInMainWorld("electronAPI", {
  openDataFolder: () => ipcRenderer.invoke("open-data-folder"),
  ensureFYTemplate: (fy) => ipcRenderer.invoke("ensure-fy-template", fy),
  importExcel: () => ipcRenderer.invoke("import-excel"),
  selectExcelFiles: () => ipcRenderer.invoke("select-excel-files"),
  parseExcelFile: (p) => ipcRenderer.invoke("parse-excel-file", p),
  listFYs: () => ipcRenderer.invoke("list-fys"),
  addFY: (fy) => ipcRenderer.invoke("add-fy", fy),
});

contextBridge.exposeInMainWorld("updateAPI", {
  check: () => ipcRenderer.invoke("check-update"),
  download: () => ipcRenderer.invoke("download-update"),
  install: () => ipcRenderer.invoke("install-update"),
  onAvailable: (cb) => ipcRenderer.on("update-available", (_e, info) => cb(info)),
  onProgress: (cb) => ipcRenderer.on("download-progress", (_e, p) => cb(p)),
  onDownloaded: (cb) => ipcRenderer.on("update-downloaded", () => cb()),
  removeListeners: () => {
    ipcRenderer.removeAllListeners("update-available");
    ipcRenderer.removeAllListeners("download-progress");
    ipcRenderer.removeAllListeners("update-downloaded");
  },
});

contextBridge.exposeInMainWorld("appInfo", {
  getVersion: () => ipcRenderer.invoke("get-app-version"),
  getLastSync: () => ipcRenderer.invoke("get-last-sync"),
  getPlatform: () => ipcRenderer.invoke("get-platform"),
});
