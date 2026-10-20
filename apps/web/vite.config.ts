import { defineConfig, type Plugin } from 'vite';

// Only in production builds: the dev server needs inline scripts and a websocket for hot reload.
const csp = (): Plugin => ({
  name: 'uniplan-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'">`),
});

export default defineConfig({
  // Relative asset URLs, so the same build works from app://, capacitor:// and plain file hosting.
  base: './',
  plugins: [csp()],
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
