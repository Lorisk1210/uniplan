import type { MenuAction, Platform, UpdateState } from './types';

/** What the Electron preload script exposes (see apps/desktop/src/preload.ts). */
export interface DesktopBridge {
  os: 'darwin' | 'linux' | 'win32' | string;
  load(): Promise<{ json: string | null; notice?: string; path: string }>;
  save(json: string): Promise<void>;
  saveSync(json: string): void;
  exportFile(file: { name: string; content: string }): Promise<boolean>;
  openFile(): Promise<string | null>;
  revealData(): void;
  onMenu(cb: (action: MenuAction) => void): void;
  updates: {
    get(): Promise<{ version: string; state: UpdateState }>;
    check(): Promise<UpdateState>;
    install(): Promise<void>;
    onChange(cb: (state: UpdateState) => void): void;
  };
}

declare global {
  interface Window {
    uniplanDesktop?: DesktopBridge;
  }
}

/** Data lives in a JSON file in the app's data folder, written by the main process. */
export async function desktopPlatform(bridge: DesktopBridge): Promise<Platform> {
  const { version, state } = await bridge.updates.get();
  const listeners: ((s: UpdateState) => void)[] = [];
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
    openFile: () => bridge.openFile(),
    revealData: () => bridge.revealData(),
    onMenu: (cb) => bridge.onMenu(cb),
    updater: {
      version,
      state,
      check: () => bridge.updates.check(),
      install: () => bridge.updates.install(),
      onChange: (cb) => { listeners.push(cb); },
    },
  };
  bridge.updates.onChange((s) => {
    platform.updater!.state = s;
    listeners.forEach((cb) => cb(s));
  });
  return platform;
}
