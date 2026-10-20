import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';
import { initApp } from './app';
import { detectPlatform } from './platform';
import { initStore } from './store';
import { toast } from './ui/toast';

async function boot() {
  const platform = await detectPlatform();
  const notice = await initStore(platform);
  initApp();
  if (notice) toast(notice);
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<div class="boot-error"><h1>Uniplan couldn’t start</h1><pre></pre></div>`;
  document.querySelector('.boot-error pre')!.textContent = String(err?.stack || err);
});
