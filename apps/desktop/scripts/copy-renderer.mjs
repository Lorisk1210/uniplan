// The desktop app ships the web build as its renderer.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../web/dist', import.meta.url));
const to = fileURLToPath(new URL('../renderer', import.meta.url));
if (!existsSync(from)) {
  console.error('No web build found. Run `npm run build` first.');
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
