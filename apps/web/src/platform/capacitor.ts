import { App } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import type { Platform } from './types';

const KEY = 'uniplan:data';

/** Data lives in the app's native key-value store, which the OS doesn't evict like web storage. */
export const capacitorPlatform = (): Platform => ({
  kind: 'mobile',
  os: Capacitor.getPlatform() === 'ios' ? 'ios' : Capacitor.getPlatform() === 'android' ? 'android' : 'other',
  canPrint: false,
  onBackButton(handler) {
    App.addListener('backButton', () => { if (!handler()) App.minimizeApp(); });
  },
  setDarkMode(dark) {
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  },
  async load() {
    const { value } = await Preferences.get({ key: KEY });
    if (value == null) return { raw: null };
    try {
      return { raw: JSON.parse(value) };
    } catch {
      const aside = `${KEY}:unreadable-${Date.now()}`;
      await Preferences.set({ key: aside, value });
      return { raw: null, notice: 'Saved data couldn’t be read. A copy was kept on the device.' };
    }
  },
  async save(json) {
    await Preferences.set({ key: KEY, value: json });
  },
  // Write to the cache folder, then hand the file to the share sheet (Files, AirDrop, mail, calendar…).
  async exportFile({ name, content }) {
    const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, url: uri, dialogTitle: name });
      return true;
    } catch {
      return false;
    }
  },
});
