import { $, $$, closest, esc } from '../dom';

export interface ChoiceOption {
  value: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

/** A small modal with a few buttons. Resolves to the chosen value, or null if dismissed. `body` is HTML. */
export function choose({ title, body, options }: { title: string; body: string; options: ChoiceOption[] }): Promise<string | null> {
  const dlg = $<HTMLDialogElement>('#dlg-choice');
  return new Promise((resolve) => {
    dlg.innerHTML = `<div class="dlg-inner">
      <div class="choice-body"><h2>${esc(title)}</h2><p>${body}</p></div>
      <div class="choice-foot">${options.map((o) =>
        `<button class="btn ${o.primary ? 'btn-primary' : ''} ${o.danger ? 'btn-danger' : ''}" data-choice="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>
    </div>`;
    const done = (v: string | null) => { dlg.close(); resolve(v); };
    dlg.onclick = (e) => {
      if (e.target === dlg) return done(null);
      const b = closest(e.target, '[data-choice]');
      if (b) done(b.dataset.choice!);
    };
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
    $$('[data-choice]', dlg).at(-1)!.focus();
  });
}
