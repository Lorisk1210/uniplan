import {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, screen, shell,
  type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Set by `npm run dev`: load the Vite dev server instead of the bundled renderer. */
const DEV_URL = process.env.UNIPLAN_DEV_URL;
const RENDERER = path.join(__dirname, '..', 'renderer');
const APP_URL = 'app://uniplan/index.html';
const isMac = process.platform === 'darwin';

// Keep data in ".../Uniplan" whatever the package is called. UNIPLAN_DATA_DIR overrides it (used by tests).
app.setName('Uniplan');
app.setPath('userData', process.env.UNIPLAN_DATA_DIR || path.join(app.getPath('appData'), 'Uniplan'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/* ───────────────────────── Data file ───────────────────────── */

const dataFile = () => path.join(app.getPath('userData'), 'uniplan.json');
const backupDir = () => path.join(app.getPath('userData'), 'backups');
const KEEP_BACKUPS = 14;

/** Write to a temp file and rename it over the old one, so a crash never leaves half a file. */
function writeAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/** One copy per day of the data as it was when the app started; the newest ones are kept. */
function dailyBackup(text: string): void {
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `uniplan-${new Date().toISOString().slice(0, 10)}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, text);
    const old = fs.readdirSync(dir).filter((f) => /^uniplan-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -KEEP_BACKUPS);
    for (const f of old) fs.rmSync(path.join(dir, f));
  } catch (err) {
    console.error('Backup failed', err);
  }
}

function loadData(): { json: string | null; notice?: string; path: string } {
  const file = dataFile();
  if (!fs.existsSync(file)) return { json: null, path: file };
  const text = fs.readFileSync(file, 'utf8');
  try {
    JSON.parse(text);
  } catch {
    // Never overwrite data we can't read: move it aside and start fresh.
    const aside = file.replace(/\.json$/, `.unreadable-${Date.now()}.json`);
    fs.renameSync(file, aside);
    return { json: null, path: file, notice: `Your data file couldn’t be read and was moved to ${aside}. Older copies are in ${backupDir()}.` };
  }
  dailyBackup(text);
  return { json: text, path: file };
}

function saveData(json: unknown): void {
  if (typeof json !== 'string' || !json.startsWith('{')) throw new Error('Refusing to save malformed data');
  writeAtomic(dataFile(), json);
}

/* ───────────────────────── Window ───────────────────────── */

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState(): WindowState {
  const fallback = { width: 1360, height: 860 };
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as WindowState;
    if (!(s.width > 0 && s.height > 0)) return fallback;
    // Forget the position if that display is gone.
    const visible = s.x != null && s.y != null && screen.getAllDisplays().some(({ workArea: a }) =>
      s.x! < a.x + a.width && s.x! + s.width > a.x && s.y! < a.y + a.height && s.y! + s.height > a.y);
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return fallback;
  }
}

function trackWindowState(win: BrowserWindow): void {
  const save = () => {
    try {
      writeAtomic(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
    } catch { /* not important */ }
  };
  win.on('close', save);
}

let win: BrowserWindow | null = null;

function createWindow(): void {
  const state = loadWindowState();
  win = new BrowserWindow({
    ...state,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'Uniplan',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111110' : '#f8f7f4',
    // macOS: no title bar; the traffic lights sit inside the app's own top bar.
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 24 } } : { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (state.maximized) win.maximize();
  trackWindowState(win);
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });

  // Links open in the browser; the window itself never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });

  win.loadURL(DEV_URL ?? APP_URL);
}

const isAppUrl = (url: string) => url.startsWith('app://uniplan/') || (!!DEV_URL && url.startsWith(DEV_URL));

/** Only our own pages may use the data API. */
function trusted(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return !!e.senderFrame && isAppUrl(e.senderFrame.url);
}

/* ───────────────────────── Menu ───────────────────────── */

function buildMenu(): void {
  const send = (action: string) => () => {
    // On macOS the app can run without a window; the menu then just brings one back.
    if (!win) { createWindow(); return; }
    win.webContents.send('menu', action);
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Degree Requirements…', accelerator: 'Cmd+,', click: send('requirements') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    } satisfies MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Course', accelerator: 'CmdOrCtrl+N', click: send('new-course') },
        { label: 'New Semester…', accelerator: 'CmdOrCtrl+Shift+N', click: send('new-semester') },
        { label: 'Edit Semester…', accelerator: 'CmdOrCtrl+E', click: send('edit-semester') },
        ...(!isMac ? [{ label: 'Degree Requirements…', accelerator: 'Ctrl+,', click: send('requirements') }] : []),
        { type: 'separator' },
        { label: 'Import Backup…', accelerator: 'CmdOrCtrl+O', click: send('import') },
        { label: 'Export Backup…', accelerator: 'CmdOrCtrl+Shift+S', click: send('export') },
        { label: 'Export Semester to Calendar…', click: send('export-ics') },
        { label: 'Show Data Folder', click: () => shell.showItemInFolder(dataFile()) },
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: send('print') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Text fields get their own undo; everywhere else this undoes the last change to your plan.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'Redo', accelerator: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Shift+Z', click: send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Study Overview', accelerator: 'CmdOrCtrl+Shift+O', click: send('overview') },
        { label: 'Previous Semester', accelerator: 'CmdOrCtrl+[', click: send('prev-semester') },
        { label: 'Next Semester', accelerator: 'CmdOrCtrl+]', click: send('next-semester') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'reload' as const }, { role: 'toggleDevTools' as const }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Uniplan on GitHub', click: () => shell.openExternal('https://github.com/Lorisk1210/uniplan') }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ───────────────────────── IPC ───────────────────────── */

ipcMain.handle('data:load', (e) => {
  if (!trusted(e)) throw new Error('Untrusted sender');
  return loadData();
});

ipcMain.handle('data:save', (e, json: unknown) => {
  if (!trusted(e)) throw new Error('Untrusted sender');
  saveData(json);
});

// Synchronous save while the window is closing, so the last change is never lost.
ipcMain.on('data:save-sync', (e, json: unknown) => {
  try {
    if (trusted(e)) saveData(json);
    e.returnValue = true;
  } catch (err) {
    console.error(err);
    e.returnValue = false;
  }
});

ipcMain.handle('file:export', async (e, file: { name?: unknown; content?: unknown }) => {
  if (!trusted(e) || typeof file?.name !== 'string' || typeof file.content !== 'string') return false;
  const name = path.basename(file.name);
  const ext = path.extname(name).slice(1);
  const owner = BrowserWindow.fromWebContents(e.sender);
  const opts = {
    defaultPath: path.join(app.getPath('downloads'), name),
    filters: [{ name: ext === 'ics' ? 'Calendar' : 'Uniplan backup', extensions: [ext] }],
  };
  const r = owner ? await dialog.showSaveDialog(owner, opts) : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, file.content);
  return true;
});

// The page can't open a file picker from a menu command (no user click), so the main process does it.
ipcMain.handle('file:open', async (e) => {
  if (!trusted(e)) return null;
  const owner = BrowserWindow.fromWebContents(e.sender);
  const opts = { properties: ['openFile' as const], filters: [{ name: 'Uniplan backup', extensions: ['json'] }] };
  const r = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts);
  if (r.canceled || !r.filePaths[0]) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

ipcMain.on('data:reveal', (e) => {
  if (trusted(e)) shell.showItemInFolder(dataFile());
});

/* ───────────────────────── Lifecycle ───────────────────────── */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    // Serves the bundled renderer, refusing anything outside its folder.
    protocol.handle('app', (req) => {
      const { pathname } = new URL(req.url);
      const file = path.normalize(path.join(RENDERER, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
      if (!file.startsWith(RENDERER + path.sep)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    app.setAboutPanelOptions({ applicationName: 'Uniplan', applicationVersion: app.getVersion(), website: 'https://github.com/Lorisk1210/uniplan' });
    buildMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
