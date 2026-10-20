import { browserPlatform } from './browser';
import { desktopPlatform } from './desktop';
import type { Platform } from './types';

export type { MenuAction, Platform } from './types';

declare global {
  interface Window {
    /** Injected by the Capacitor native shell before the page loads. */
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

export async function detectPlatform(): Promise<Platform> {
  if (window.uniplanDesktop) return desktopPlatform(window.uniplanDesktop);
  if (window.Capacitor?.isNativePlatform?.()) return (await import('./capacitor')).capacitorPlatform();
  return browserPlatform();
}
