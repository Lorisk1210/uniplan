import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Only in production builds: the dev server needs inline scripts and a websocket for hot reload.
// The page may also talk to the sync server.
const csp = (convexUrl: string): Plugin => {
  const sync = convexUrl ? ` ${convexUrl} ${convexUrl.replace(/^http/, 'ws')}` : '';
  return {
    name: 'uniplan-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${sync}; object-src 'none'; base-uri 'self'">`),
  };
};

export default defineConfig(({ command, mode }) => {
  // The sync server. Builds use VITE_CONVEX_URL (.env.production has the production deployment).
  // The dev server uses the dev deployment `npm run convex` wrote to packages/backend/.env.local.
  const backend = fileURLToPath(new URL('../../packages/backend', import.meta.url));
  const convexUrl = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_').VITE_CONVEX_URL
    || (command === 'serve' ? loadEnv(mode, backend, 'CONVEX_URL').CONVEX_URL : '')
    || '';
  return {
    // Relative asset URLs, so the same build works from app://, capacitor:// and plain file hosting.
    base: './',
    define: { __CONVEX_URL__: JSON.stringify(convexUrl) },
    plugins: [csp(convexUrl)],
    server: { port: 5173, strictPort: true },
    build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  };
});
