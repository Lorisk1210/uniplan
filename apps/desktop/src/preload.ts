// Runs sandboxed before the page loads. Exposes a small, fixed API; the page never gets Node or Electron.
// Its shape is `DesktopBridge` in apps/web/src/platform/desktop.ts.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('uniplanDesktop', {
  os: process.platform,
  load: () => ipcRenderer.invoke('data:load'),
  save: (json: string) => ipcRenderer.invoke('data:save', json),
  saveSync: (json: string) => { ipcRenderer.sendSync('data:save-sync', json); },
  exportFile: (file: { name: string; content: string }) => ipcRenderer.invoke('file:export', file),
  openFile: () => ipcRenderer.invoke('file:open'),
  revealData: () => ipcRenderer.send('data:reveal'),
  onMenu: (cb: (action: string) => void) => {
    ipcRenderer.on('menu', (_e, action: string) => cb(action));
  },
  updates: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onChange: (cb: (state: unknown) => void) => {
      ipcRenderer.on('update:state', (_e, state: unknown) => cb(state));
    },
  },
});
