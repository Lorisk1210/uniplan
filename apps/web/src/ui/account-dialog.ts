import { $, closest, esc, icon } from '../dom';
import { signIn } from '../sync';
import { toast } from './toast';

const dlg = (): HTMLDialogElement => $<HTMLDialogElement>('#dlg-account');

/** Sign in or create an account. `email` fills in the field, e.g. after the sign-in ran out. */
export function openAccountDialog(email = ''): void {
  const d = dlg();
  d.innerHTML = `<form class="ed" novalidate>
    <header class="dlg-head">
      <h2>Sync between devices</h2>
      <span class="grow"></span>
      <button type="button" class="icon-btn" data-ad="close" title="Close (Esc)">${icon('x')}</button>
    </header>
    <div class="dlg-body">
      <p class="hint">Sign in on each device, and your plan stays the same on all of them. Each device keeps its own copy too, so it works offline.</p>
      <label class="field"><span>Email</span>
        <input name="email" type="email" value="${esc(email)}" autocomplete="username" required></label>
      <label class="field"><span>Password</span>
        <input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
      <p class="form-error" role="alert" hidden></p>
    </div>
    <footer class="dlg-foot">
      <button type="button" class="btn btn-ghost" data-ad="sign-up">Create account</button>
      <span class="spacer"></span>
      <button type="submit" class="btn btn-primary">Sign in</button>
    </footer>
  </form>`;
  d.showModal();
  $<HTMLInputElement>(email ? 'input[name=password]' : 'input[name=email]', d).focus();
}

async function submit(flow: 'signIn' | 'signUp'): Promise<void> {
  const d = dlg();
  const email = $<HTMLInputElement>('input[name=email]', d);
  const password = $<HTMLInputElement>('input[name=password]', d);
  const error = $('.form-error', d);
  const fail = (msg: string, field?: HTMLInputElement) => {
    error.textContent = msg;
    error.hidden = false;
    field?.classList.add('invalid');
    field?.focus();
  };
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return fail('Enter your email address.', email);
  if (password.value.length < 8) return fail('Use a password with at least 8 characters.', password);
  const buttons = [...d.querySelectorAll<HTMLButtonElement>('.dlg-foot button')];
  buttons.forEach((b) => { b.disabled = true; });
  const msg = await signIn(email.value, password.value, flow);
  buttons.forEach((b) => { b.disabled = false; });
  if (msg) return fail(msg);
  d.close();
  toast(flow === 'signUp' ? 'Account created. Your plan now syncs.' : 'Signed in. Your plan now syncs.');
}

export function initAccountDialog(): void {
  const d = dlg();
  d.addEventListener('submit', (e) => { e.preventDefault(); submit('signIn'); });
  d.addEventListener('click', (e) => {
    if (e.target === d) { d.close(); return; }
    const b = closest(e.target, '[data-ad]');
    if (b?.dataset.ad === 'close') d.close();
    if (b?.dataset.ad === 'sign-up') submit('signUp');
  });
  d.addEventListener('input', (e) => {
    (e.target as HTMLElement).classList.remove('invalid');
    $('.form-error', d).hidden = true;
  });
}
