import { $, esc } from '../dom';

export interface ToastOptions {
  action?: string;
  onAction?: () => void;
}

export function toast(msg: string, opts: ToastOptions = {}): void {
  const host = $('#toasts');
  while (host.children.length >= 3) host.firstElementChild!.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button>${esc(opts.action)}</button>` : ''}`;
  host.appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  const timer = setTimeout(kill, opts.action ? 5000 : 2400);
  if (opts.action) $('button', el).addEventListener('click', () => { clearTimeout(timer); kill(); opts.onAction?.(); });
}
