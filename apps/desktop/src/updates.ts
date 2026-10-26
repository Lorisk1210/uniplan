// Updates come from the GitHub releases (see `publish` in electron-builder.yml).
//
// Linux: electron-updater downloads the new AppImage or .deb in the background, then the page offers a restart.
// macOS: the app is signed ad hoc, and Apple's updater only installs apps with a Developer ID. So electron-updater
// only checks; installing downloads the new .dmg, opens it and quits, and you drag the app over the old one.
// A file the app downloads itself isn't quarantined, so the new version opens without `xattr`.
import { app, BrowserWindow, ipcMain, net, shell, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Same shape as `UpdateState` in apps/web/src/platform/types.ts. */
export type UpdateState =
  | { status: 'idle' | 'checking' | 'latest' | 'unsupported' }
  | { status: 'available' | 'ready'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'error'; message: string };

const REPO = 'Lorisk1210/uniplan';
const CHECK_EVERY = 4 * 60 * 60 * 1000;
const isMac = process.platform === 'darwin';

let state: UpdateState = { status: 'idle' };
let info: UpdateInfo | null = null;

function set(next: UpdateState): void {
  state = next;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:state', state);
}

/** Busy states a new check mustn't interrupt. */
const busy = () => state.status === 'checking' || state.status === 'downloading' || state.status === 'ready';

async function check(): Promise<UpdateState> {
  if (busy() || (isMac && state.status === 'available')) return state;
  set({ status: 'checking' });
  try {
    // Resolves null when updates can't work here: not packaged, or a Linux build that's neither AppImage nor .deb.
    const r = await autoUpdater.checkForUpdates();
    if (!r) set({ status: 'unsupported' });
    else if (!r.isUpdateAvailable) set({ status: 'latest' });
    // Otherwise the update-available event has set the state already.
  } catch (err) {
    console.error('Update check failed', err);
    set({ status: 'error', message: err instanceof Error ? err.message : String(err) });
  }
  return state;
}

/** The .dmg for this Mac. Apple Silicon gets the arm64 build, also when the app runs under Rosetta. */
function dmgFor(update: UpdateInfo): { url: string; name: string; sha512?: string } {
  const arch = process.arch === 'arm64' || app.runningUnderARM64Translation ? 'arm64' : 'x64';
  const name = `Uniplan-${update.version}-mac-${arch}.dmg`;
  const listed = update.files.find((f) => path.basename(f.url) === name);
  return { name, sha512: listed?.sha512, url: `https://github.com/${REPO}/releases/download/v${update.version}/${name}` };
}

async function downloadDmg(update: UpdateInfo): Promise<string> {
  const { url, name, sha512 } = dmgFor(update);
  const file = path.join(app.getPath('temp'), name);
  const part = `${file}.part`;
  set({ status: 'downloading', version: update.version, percent: 0 });
  const res = await net.fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = createHash('sha512');
  const out = fs.createWriteStream(part);
  let got = 0;
  let shown = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
      got += chunk.length;
      const percent = total ? Math.floor((got / total) * 100) : 0;
      if (percent !== shown) { shown = percent; set({ status: 'downloading', version: update.version, percent }); }
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
  if (sha512 && hash.digest('base64') !== sha512) {
    fs.rmSync(part, { force: true });
    throw new Error('The downloaded update is damaged (checksum mismatch)');
  }
  fs.renameSync(part, file);
  return file;
}

async function install(): Promise<void> {
  if (!isMac) {
    // Restarts into the new version. The page saves on its way out, as it does for any quit.
    if (state.status === 'ready') autoUpdater.quitAndInstall(false, true);
    return;
  }
  if (state.status !== 'available' || !info) return;
  const update = info;
  try {
    const dmg = await downloadDmg(update);
    const err = await shell.openPath(dmg);
    if (err) throw new Error(err);
    // Quit so Finder can replace the app.
    setTimeout(() => app.quit(), 500);
  } catch (err) {
    console.error('Update download failed', err);
    // The button offers the download again, and the page shows the error.
    set({ status: 'available', version: update.version });
    throw err;
  }
}

export function initUpdates(trusted: (e: IpcMainInvokeEvent) => boolean): void {
  autoUpdater.autoDownload = !isMac;
  // An AppImage swaps itself silently on quit. A .deb asks for a password, so it only installs on Restart.
  autoUpdater.autoInstallOnAppQuit = !!process.env.APPIMAGE;
  autoUpdater.logger = null;

  autoUpdater.on('update-available', (i: UpdateInfo) => {
    info = i;
    set(isMac ? { status: 'available', version: i.version } : { status: 'downloading', version: i.version, percent: 0 });
  });
  autoUpdater.on('download-progress', (p: { percent: number }) => {
    if (info) set({ status: 'downloading', version: info.version, percent: Math.floor(p.percent) });
  });
  autoUpdater.on('update-downloaded', (i: UpdateInfo) => set({ status: 'ready', version: i.version }));
  autoUpdater.on('error', (err: Error) => {
    console.error('Updater error', err);
    // A failed background download: try again on the next check.
    if (state.status === 'downloading') set({ status: 'error', message: err.message });
  });

  ipcMain.handle('update:get', (e) => {
    if (!trusted(e)) throw new Error('Untrusted sender');
    return { version: app.getVersion(), state };
  });
  ipcMain.handle('update:check', (e) => {
    if (!trusted(e)) throw new Error('Untrusted sender');
    return check();
  });
  ipcMain.handle('update:install', (e) => {
    if (!trusted(e)) throw new Error('Untrusted sender');
    return install();
  });

  if (!app.isPackaged) { state = { status: 'unsupported' }; return; }
  // Check shortly after start, then every few hours. Failures (offline, say) stay quiet until the next try.
  setTimeout(check, 10_000);
  setInterval(check, CHECK_EVERY);
}
