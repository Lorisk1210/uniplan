// Runs the web dev server and opens Electron on it. Renderer changes hot-reload;
// changes to the main process or preload need a restart.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const url = 'http://localhost:5173';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (spawnSync(npm, ['exec', '-w', '@uniplan/desktop', '--', 'tsc', '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' }).status) process.exit(1);

const vite = spawn(npm, ['run', 'dev', '-w', '@uniplan/web'], { cwd: root, stdio: 'inherit' });
for (let i = 0; ; i++) {
  try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
  if (i > 100) { console.error(`Dev server didn't start on ${url}`); vite.kill(); process.exit(1); }
  await new Promise((r) => setTimeout(r, 200));
}

const app = spawn(electron, ['.'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
  env: { ...process.env, UNIPLAN_DEV_URL: url },
});
app.on('exit', (code) => { vite.kill(); process.exit(code ?? 0); });
process.on('SIGINT', () => { app.kill(); vite.kill(); });
