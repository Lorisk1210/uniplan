import type { MenuAction, Platform } from './types';

/** What the Electron preload script exposes (see apps/desktop/src/preload.ts). */
export interface DesktopBridge {
  os: 'darwin' | 'linux' | 'win32' | string;
  load(): Promise<{ json: string | null; notice?: string; path: string }>;
  save(json: string): Promise<void>;
  saveSync(json: string): void;
  exportFile(file: { name: string; content: string }): Promise<boolean>;
  revealData(): void;
  onMenu(cb: (action: MenuAction) => void): void;
}

declare global {
  interface Window {
    uniplanDesktop?: DesktopBridge;
  }
}

/** Data lives in a JSON file in the app's data folder, written by the main process. */
export async function desktopPlatform(bridge: DesktopBridge): Promise<Platform> {
  const os = bridge.os === 'darwin' ? 'mac' : bridge.os === 'linux' ? 'linux' : bridge.os === 'win32' ? 'windows' : 'other';
  const platform: Platform = {
    kind: 'desktop',
    os,
    canPrint: true,
    nativeUndo: true,
    async load() {
      const r = await bridge.load();
      platform.dataLocation = r.path;
      // The main process already set unreadable files aside, so this parse can't fail on old data.
      return { raw: r.json == null ? null : JSON.parse(r.json), notice: r.notice };
    },
    save: (json) => bridge.save(json),
    flush: (json) => bridge.saveSync(json),
    exportFile: ({ name, content }) => bridge.exportFile({ name, content }),
    revealData: () => bridge.revealData(),
    onMenu: (cb) => bridge.onMenu(cb),
  };
  return platform;
}
