// Syncs the plan between devices through Convex (packages/backend).
//
// Every app keeps working on its own copy, as before. This module compares three versions of the plan
// item by item (see mergeItems in @uniplan/core): the server state the device last took in (`base`),
// the device's own plan, and the server's current state. It takes in what other devices changed and
// sends what this device changed. `base` is saved, so changes made offline go out on the next start.
import { api } from '@uniplan/backend/api';
import { canonicalItems, fromItems, mergeItems, sameItems, toItems, type SyncItems } from '@uniplan/core';
import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import { ConvexError } from 'convex/values';
import { applySynced, onLocalChange, state } from './store';
import { choose } from './ui/choice';
import { toast } from './ui/toast';

/** The Convex deployment, set at build time (see vite.config.ts). Empty: this build doesn't sync. */
const URL = __CONVEX_URL__;

const ACCOUNT_KEY = 'uniplan:account';
const BASE_KEY = 'uniplan:sync:base';
/** Items per mutation; the server takes at most 200. */
const BATCH = 100;

interface Account {
  email: string;
  token: string;
  refreshToken: string;
}

export type SyncStatus =
  | { kind: 'off' }
  | { kind: 'signed-out' }
  /** expired: the sign-in ran out and the user has to sign in again. */
  | { kind: 'syncing' | 'synced' | 'offline' | 'expired'; email: string };

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}
function write(key: string, value: unknown): void {
  if (value == null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

let account = read<Account>(ACCOUNT_KEY);
let base = loadBase();
let remote: SyncItems | null = null;
let client: ConvexClient | null = null;
let connected = true;
let expired = false;
let pushing = false;
let again = false;
/** Set while the user picks how to combine this device's plan with the account's. */
let deciding = false;

function loadBase(): SyncItems | null {
  const saved = read<{ email: string; items: [string, string][] }>(BASE_KEY);
  return saved && saved.email === account?.email ? new Map(saved.items) : null;
}
const saveBase = () => write(BASE_KEY, base && account ? { email: account.email, items: [...base] } : null);

/* ───────────────────────── Status ───────────────────────── */

const statusListeners: (() => void)[] = [];
export const onSyncStatus = (fn: () => void): void => { statusListeners.push(fn); };

export function syncStatus(): SyncStatus {
  if (!URL) return { kind: 'off' };
  if (!account) return { kind: 'signed-out' };
  const { email } = account;
  if (expired) return { kind: 'expired', email };
  if (!connected) return { kind: 'offline', email };
  return { kind: pushing || deciding || !remote ? 'syncing' : 'synced', email };
}

let lastStatus = '';
function statusChanged(): void {
  const s = JSON.stringify(syncStatus());
  if (s === lastStatus) return;
  lastStatus = s;
  statusListeners.forEach((fn) => fn());
}

/* ───────────────────────── Connection and sign-in ───────────────────────── */

const isNetworkError = (e: unknown) => e instanceof TypeError;

/** Hands Convex the access token, and gets a new one with the refresh token when it runs out. */
async function fetchToken({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> {
  if (!account) return null;
  if (!forceRefreshToken) return account.token;
  // A refresh token works once. With several tabs open, one renews and the others pick up its tokens.
  const renew = async (): Promise<string> => {
    const stored = read<Account>(ACCOUNT_KEY);
    if (stored && account && stored.email === account.email && stored.token !== account.token) {
      account = stored;
      return account.token;
    }
    const r = await new ConvexHttpClient(URL).action(api.auth.signIn, { refreshToken: account!.refreshToken });
    if (!r.tokens) throw new Error('The sign-in has ended');
    account = { ...account!, ...r.tokens };
    write(ACCOUNT_KEY, account);
    return account.token;
  };
  try {
    return navigator.locks ? await navigator.locks.request('uniplan:renew-sign-in', renew) : await renew();
  } catch (e) {
    if (isNetworkError(e)) {
      // Offline: try again in a while. The plan keeps working on this device meanwhile.
      setTimeout(() => client?.setAuth(fetchToken, statusChanged), 30_000);
    } else {
      console.error(e);
      expired = true;
      statusChanged();
    }
    return null;
  }
}

function connect(): void {
  client = new ConvexClient(URL, { unsavedChangesWarning: false });
  client.setAuth(fetchToken, statusChanged);
  // Offline once a connection dropped or an attempt failed, so starting up doesn't count.
  client.subscribeToConnectionState((s) => {
    connected = s.isWebSocketConnected || (!s.hasEverConnected && !s.connectionRetries);
    statusChanged();
  });
  client.onUpdate(api.plan.items, {}, (items) => {
    // null: not signed in (yet). The auth callbacks handle that.
    if (!items) return;
    remote = canonicalItems(new Map(items.map((i) => [i.key, i.value])));
    reconcile();
  }, (e) => console.error('Sync subscription failed', e));
}

/** The error codes of account:signIn (packages/backend/convex/account.ts), as something to show. */
const SIGN_IN_ERRORS: Record<string, string> = {
  InvalidAccountId: 'There’s no account with this email. Create one?',
  InvalidSecret: 'Wrong password.',
  'already exists': 'There’s already an account with this email. Sign in instead.',
  'Invalid password': 'Use a password with at least 8 characters.',
  TooManyFailedAttempts: 'Too many wrong passwords. Wait a few minutes and try again.',
};

function signInError(e: unknown, flow: 'signIn' | 'signUp'): string {
  if (isNetworkError(e)) return 'Couldn’t reach the sync server. Check your connection.';
  const known = e instanceof ConvexError && SIGN_IN_ERRORS[String(e.data)];
  if (known) return known;
  console.error(e);
  return flow === 'signUp' ? 'Couldn’t create the account.' : 'Couldn’t sign in.';
}

/** Resolves to an error message, or null when signed in. */
export async function signIn(emailRaw: string, password: string, flow: 'signIn' | 'signUp'): Promise<string | null> {
  const email = emailRaw.trim().toLowerCase();
  let tokens: { token: string; refreshToken: string } | null;
  try {
    tokens = await new ConvexHttpClient(URL).action(api.account.signIn, { email, password, flow });
  } catch (e) {
    return signInError(e, flow);
  }
  if (!tokens) return 'Couldn’t sign in.';
  if (account?.email !== email) { base = null; remote = null; }
  account = { email, ...tokens };
  write(ACCOUNT_KEY, account);
  saveBase();
  expired = false;
  if (client) client.setAuth(fetchToken, statusChanged);
  else connect();
  statusChanged();
  return null;
}

/** Stops syncing. The plan stays on this device. */
export async function signOut(): Promise<void> {
  const c = client;
  client = null;
  if (c) {
    await c.action(api.auth.signOut, {}).catch(() => {});
    await c.close();
  }
  account = null;
  base = null;
  remote = null;
  expired = false;
  write(ACCOUNT_KEY, null);
  saveBase();
  statusChanged();
}

/* ───────────────────────── Merging ───────────────────────── */

/** The first sync on this device: say how its plan and the account's go together. */
async function decideFirstSync(): Promise<void> {
  const local = state.data.semesters.some((s) => s.courses.length);
  const theirs = [...remote!.keys()].some((k) => k.startsWith('course:'));
  // Nothing to lose on either side: an empty account takes this device's plan, an empty device takes the account's.
  let replace = !local && [...remote!.keys()].some((k) => k.startsWith('semester:'));
  if (local && theirs) {
    const v = await choose({
      title: 'Combine with your account?',
      body: 'This device and your account both have courses. <b>Combine</b> keeps all of them. <b>Use account</b> replaces the courses on this device with the account’s. Export a backup first if you’re unsure.',
      options: [{ value: 'replace', label: 'Use account' }, { value: 'merge', label: 'Combine', primary: true }],
    });
    replace = v === 'replace';
  }
  if (replace) {
    base = remote;
    applySynced(fromItems(remote!));
  }
}

async function reconcile(): Promise<void> {
  if (!remote || !account || deciding) return;
  if (pushing) { again = true; return; }
  if (!base) {
    deciding = true;
    statusChanged();
    try { await decideFirstSync(); } finally { deciding = false; }
  }
  const local = toItems(state.data);
  const { merged, put, remove } = mergeItems(base, local, remote);
  base = remote;
  saveBase();
  if (!sameItems(merged, local)) applySynced(fromItems(merged));
  if (put.length || remove.length) await push(put, remove);
  statusChanged();
}

async function push(put: [string, string][], remove: string[]): Promise<void> {
  pushing = true;
  statusChanged();
  try {
    const c = client;
    for (let i = 0; i < put.length + remove.length; i += BATCH) {
      // A mutation sent while offline waits for the connection to come back.
      await c?.mutation(api.plan.push, {
        put: put.slice(i, i + BATCH).map(([key, value]) => ({ key, value })),
        remove: remove.slice(Math.max(0, i - put.length), Math.max(0, i + BATCH - put.length)),
      });
    }
  } catch (e) {
    console.error('Sync push failed', e);
    toast('Couldn’t sync your latest changes. They’re saved on this device.');
  } finally {
    pushing = false;
  }
  if (again) {
    again = false;
    await reconcile();
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function initSync(): void {
  if (!URL) return;
  // Changes made here go out shortly after, a burst of them together.
  onLocalChange(() => {
    clearTimeout(timer);
    timer = setTimeout(reconcile, 300);
  });
  if (account) connect();
  statusChanged();
}
