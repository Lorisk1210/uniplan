import { $, esc, icon } from '../dom';
import type { UpdateState } from '../platform';
import { state } from '../store';
import { choose } from './choice';
import { toast } from './toast';

/* ───────────────────────── Update button ───────────────────────── */

// Shows up in the top bar once there's an update. Only the desktop app has an updater.
function renderUpdateButton(s: UpdateState): void {
  const btn = $<HTMLButtonElement>('#btn-update');
  const show = (ic: string, label: string, title: string, disabled = false) => {
    btn.innerHTML = `${icon(ic)}<span class="label">${esc(label)}</span>`;
    btn.title = title;
    btn.disabled = disabled;
    btn.hidden = false;
  };
  if (s.status === 'available') show('download', `Update to ${s.version}`, `Download Uniplan ${s.version}`);
  else if (s.status === 'downloading') show('download', `Downloading ${s.percent}%`, `Downloading Uniplan ${s.version}`, true);
  else if (s.status === 'ready') show('restore', 'Restart to update', `Restart into Uniplan ${s.version}`);
  else btn.hidden = true;
}

async function install(): Promise<void> {
  const updater = state.platform.updater!;
  const s = updater.state;
  if (s.status === 'available') {
    // macOS: the app can't replace itself, so say what happens before it quits.
    const v = await choose({
      title: `Update to Uniplan ${s.version}?`,
      body: 'Uniplan downloads the new version, opens it and quits. Drag Uniplan into the Applications folder, choose <b>Replace</b>, then open it again. Your data stays where it is.',
      options: [{ value: 'cancel', label: 'Not now' }, { value: 'ok', label: 'Download', primary: true }],
    });
    if (v !== 'ok') return;
  }
  try {
    await updater.install();
  } catch (err) {
    console.error(err);
    toast('Couldn’t download the update. Check your connection and try again.');
  }
}

/* ───────────────────────── Checking by hand ───────────────────────── */

export async function checkForUpdates(): Promise<void> {
  const updater = state.platform.updater;
  if (!updater) return;
  const s = await updater.check();
  if (s.status === 'latest') toast(`You have the latest version (${updater.version})`);
  else if (s.status === 'available') toast(`Uniplan ${s.version} is available`, { action: 'Download', onAction: install });
  else if (s.status === 'downloading') toast(`Downloading Uniplan ${s.version}…`);
  else if (s.status === 'ready') toast(`Uniplan ${s.version} is ready`, { action: 'Restart', onAction: install });
  else if (s.status === 'unsupported') toast('This copy of Uniplan can’t update itself. Updates work in the installed app.');
  else if (s.status === 'checking') toast('Already checking for updates…');
  else if (s.status === 'error') toast('Couldn’t check for updates. Check your connection and try again.');
}

export function initUpdates(): void {
  const updater = state.platform.updater;
  if (!updater) return;
  renderUpdateButton(updater.state);
  updater.onChange(renderUpdateButton);
  $('#btn-update').addEventListener('click', install);
}
