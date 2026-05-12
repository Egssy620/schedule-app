const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

/* ─── helpers ─── */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function getFY(year, month) {
  return month >= 2 ? year : year - 1;
}

/* ─── CSV parse / generate ─── */

function parseCSVLines(text) {
  const result = [];
  let current = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      current.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      current.push(field);
      field = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.some((f) => f.trim())) result.push(current);
      current = [];
    } else {
      field += ch;
    }
  }
  current.push(field);
  if (current.some((f) => f.trim())) result.push(current);
  return result;
}

function csvToRecords(csvText) {
  const text = csvText.replace(/^﻿/, "");
  const rows = parseCSVLines(text);
  const records = {};
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.length < 1) continue;
    const date = cols[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const clockIn = (cols[2] || "").trim() || null;
    const clockOut = (cols[3] || "").trim() || null;
    const note = (cols[4] || "").trim() || "";
    if (clockIn || clockOut || note) {
      records[date] = { clockIn, clockOut, note };
    }
  }
  return records;
}

function generateCSV(fy, records) {
  const start = new Date(fy, 2, 1);
  const end = new Date(fy + 1, 2, 0);
  let csv = "﻿日付,曜日,出勤,退勤,作業内容\n";
  const d = new Date(start);
  while (d <= end) {
    const ds = fmtDate(d);
    const dow = DAYS_JP[d.getDay()];
    const r = records[ds];
    const ci = r?.clockIn || "";
    const co = r?.clockOut || "";
    const nt = r?.note
      ? '"' + r.note.replace(/"/g, '""') + '"'
      : "";
    csv += `${ds},${dow},${ci},${co},${nt}\n`;
    d.setDate(d.getDate() + 1);
  }
  return csv;
}

/* ─── config store ─── */

let configPath = "";
let configMap = {};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      configMap = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch { configMap = {}; }
}

function saveConfig() {
  try { fs.writeFileSync(configPath, JSON.stringify(configMap, null, 2), "utf8"); }
  catch (e) { console.error("[saveConfig]", e); }
}

/* ─── data directory ─── */

let dataDir = "";

function ensureDataDir() {
  dataDir = path.join(app.getPath("userData"), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function csvPathForFY(fy) {
  return path.join(dataDir, `勤怠記録_${fy}年度.csv`);
}

function ensureTemplate(fy) {
  const p = csvPathForFY(fy);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, generateCSV(fy, {}), "utf8");
  }
}

function readAllRecords() {
  const records = {};
  if (!fs.existsSync(dataDir)) return records;
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith(".csv")) continue;
    const text = fs.readFileSync(path.join(dataDir, f), "utf8");
    Object.assign(records, csvToRecords(text));
  }
  return records;
}

function writeRecordsForFY(fy, records) {
  const p = csvPathForFY(fy);
  fs.writeFileSync(p, generateCSV(fy, records), "utf8");
}

/* records JSON に含まれる全年度を判定して書込 */
function writeAllRecords(recordsObj) {
  const fys = new Set();
  for (const key of Object.keys(recordsObj)) {
    const [y, m] = key.split("-").map(Number);
    fys.add(getFY(y, m - 1));
  }
  for (const fy of fys) {
    const prefix = (fyMonth) => {
      const y = fyMonth >= 2 ? fy : fy + 1;
      return `${y}-${pad2(fyMonth + 1)}`;
    };
    const fyRecords = {};
    const FY_MONTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1];
    for (const mi of FY_MONTHS) {
      const pre = prefix(mi);
      for (const k of Object.keys(recordsObj)) {
        if (k.startsWith(pre)) fyRecords[k] = recordsObj[k];
      }
    }
    ensureTemplate(fy);
    writeRecordsForFY(fy, fyRecords);
  }
  configMap["last_sync"] = new Date().toISOString();
  saveConfig();
}

/* ─── window ─── */

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 780,
    title: "勤怠記録",
    icon: path.join(__dirname, "icon_rounded.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    mainWindow.webContents.openDevTools();
  }
}

/* ─── IPC ─── */

ipcMain.handle("storage-get", (_e, key) => {
  if (key === "schedule_records") {
    return { value: JSON.stringify(readAllRecords()) };
  }
  if (key === "save_folder") {
    return { value: dataDir };
  }
  if (key in configMap) {
    return { value: configMap[key] };
  }
  return null;
});

ipcMain.handle("storage-set", (_e, key, value) => {
  if (key === "schedule_records") {
    try {
      writeAllRecords(JSON.parse(value));
    } catch (e) {
      console.error("[storage-set]", e);
    }
    return true;
  }
  configMap[key] = value;
  saveConfig();
  return true;
});

ipcMain.handle("open-data-folder", () => {
  shell.openPath(dataDir);
});

ipcMain.handle("ensure-fy-template", (_e, fy) => {
  ensureTemplate(fy);
});

/* ─── Excel parser (shared) ─── */
function parseExcelFile(filePath) {
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(filePath, { cellDates: true });

  const wsLedger = wb.Sheets["原簿"];
  if (!wsLedger) return { error: "原簿シートが見つかりません" };
  const ledger = XLSX.utils.sheet_to_json(wsLedger, { header: 1, raw: true, defval: null });

  let year = null, month = null;
  const k2 = wsLedger["K2"];
  if (k2 && k2.v) {
    const m = String(k2.v).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
    if (m) { year = parseInt(m[1]); month = parseInt(m[2]); }
  }

  const timeRecords = {};
  for (let r = 5; r < ledger.length && ledger[r]; r++) {
    const row = ledger[r];
    const day = row[0];
    if (day == null) continue;
    let earliest = null, latest = null;
    for (let p = 0; p < 4; p++) {
      const inVal = row[1 + p * 2];
      const outVal = row[2 + p * 2];
      if (inVal instanceof Date) { const t = inVal.getHours() * 60 + inVal.getMinutes(); if (earliest === null || t < earliest) earliest = t; }
      if (outVal instanceof Date) { const t = outVal.getHours() * 60 + outVal.getMinutes(); if (latest === null || t > latest) latest = t; }
    }
    if (year && month) {
      const ds = `${year}-${pad2(month)}-${pad2(day)}`;
      timeRecords[ds] = {
        clockIn: earliest !== null ? `${pad2(Math.floor(earliest / 60))}:${pad2(earliest % 60)}` : null,
        clockOut: latest !== null ? `${pad2(Math.floor(latest / 60))}:${pad2(latest % 60)}` : null,
      };
    }
  }

  const wsJournal = wb.Sheets["研究作業日誌"];
  if (wsJournal) {
    const journal = XLSX.utils.sheet_to_json(wsJournal, { header: 1, raw: true, defval: null });
    for (let r = 5; r < journal.length && journal[r]; r++) {
      const row = journal[r];
      const day = row[0];
      if (day == null) continue;
      const noteParts = [];
      if (row[19]) noteParts.push(String(row[19]).trim());
      if (row[20]) noteParts.push(String(row[20]).trim());
      const note = noteParts.join("").replace(/\t/g, "");
      if (year && month) {
        const ds = `${year}-${pad2(month)}-${pad2(day)}`;
        if (!timeRecords[ds]) timeRecords[ds] = { clockIn: null, clockOut: null };
        timeRecords[ds].note = note;
      }
    }
  }

  const records = {};
  for (const [k, v] of Object.entries(timeRecords)) {
    if (v.clockIn || v.clockOut || v.note) records[k] = v;
  }
  return { fileName: path.basename(filePath), year, month, records };
}

ipcMain.handle("import-excel", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "研究作業日誌をインポート",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
    properties: ["openFile"],
  });
  if (result.canceled) return null;
  try { return parseExcelFile(result.filePaths[0]); }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle("select-excel-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "研究作業日誌をインポート（複数選択可）",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return null;
  return result.filePaths;
});

ipcMain.handle("parse-excel-file", (_e, filePath) => {
  try { return parseExcelFile(filePath); }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle("list-fys", () => {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir)
    .filter(f => f.endsWith(".csv"))
    .map(f => { const m = f.match(/勤怠記録_(\d{4})年度/); return m ? parseInt(m[1]) : null; })
    .filter(Boolean)
    .sort((a, b) => b - a);
});

ipcMain.handle("add-fy", (_e, fy) => {
  ensureDataDir();
  ensureTemplate(fy);
  return true;
});

/* ─── app info ─── */

ipcMain.handle("get-app-version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  return pkg.version || "0.0.0";
});

ipcMain.handle("get-last-sync", () => {
  return configMap["last_sync"] || null;
});

/* ─── auto-updater ─── */

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({ provider: "github", owner: "Egssy620", repo: "schedule-app" });

autoUpdater.on("update-available", (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-available", {
      version: info.version,
      releaseNotes: info.releaseNotes || "",
    });
  }
});

autoUpdater.on("download-progress", (progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("download-progress", { percent: Math.round(progress.percent) });
  }
});

autoUpdater.on("update-downloaded", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-downloaded");
  }
});

autoUpdater.on("error", (err) => {
  console.error("[autoUpdater]", err?.message || err);
});

ipcMain.handle("check-update", async () => {
  console.log("[check-update] invoked, isPackaged:", app.isPackaged);
  if (!app.isPackaged) return { available: false, reason: "dev" };
  try {
    console.log("[check-update] calling autoUpdater.checkForUpdates...");
    const result = await autoUpdater.checkForUpdates();
    console.log("[check-update] result:", result?.updateInfo ? JSON.stringify({ version: result.updateInfo.version, files: result.updateInfo.files?.length }) : "null");
    if (result && result.updateInfo && result.updateInfo.version) {
      return { available: true, version: result.updateInfo.version, releaseNotes: result.updateInfo.releaseNotes || "" };
    }
    return { available: false };
  } catch (e) {
    console.error("[check-update] error:", e?.message, e?.stack);
    return { available: false, error: e?.message || "unknown" };
  }
});

ipcMain.handle("download-update", async () => {
  try { await autoUpdater.downloadUpdate(); } catch (e) { console.error("[download-update]", e?.message); }
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall(false, true);
});

/* ─── app lifecycle ─── */

app.whenReady().then(() => {
  ensureDataDir();
  configPath = path.join(app.getPath("userData"), "config.json");
  loadConfig();

  if (process.platform === "darwin") {
    app.dock.setIcon(path.join(__dirname, "icon_rounded.png"));
  }

  const now = new Date();
  const fy = getFY(now.getFullYear(), now.getMonth());
  ensureTemplate(fy);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
