import type { ExportFile, Platform } from './types';

const KEY = 'uniplan:v2';
/** Version 1 kept a flat list of courses here. It's left in place as a fallback copy. */
const LEGACY_KEY = 'uniplan:v1';

export function download({ name, content, mime }: ExportFile): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

const os = (): Platform['os'] => {
  const p = navigator.userAgent;
  return /Mac/.test(p) ? 'mac' : /Linux/.test(p) ? 'linux' : /Win/.test(p) ? 'windows' : 'other';
};

/** Data lives in localStorage, like the original single-file app. */
export const browserPlatform = (): Platform => ({
  kind: 'browser',
  os: os(),
  canPrint: true,
  async load() {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (raw == null) return { raw: null };
    try {
      return { raw: JSON.parse(raw) };
    } catch {
      const aside = `${KEY}:unreadable-${Date.now()}`;
      localStorage.setItem(aside, raw);
      return { raw: null, notice: `Saved data couldn’t be read. It was kept under “${aside}” in localStorage.` };
    }
  },
  async save(json) {
    localStorage.setItem(KEY, json);
  },
  async exportFile(file) {
    download(file);
    return true;
  },
});
