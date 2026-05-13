import { STATE, persistAte, persistCurrent, KEY_TARGETS } from './state.js';

const KEY_BASE      = 'sync_firebase_url';
const KEY_LOCAL_TS  = 'sync_local_ts';
const SYNC_PATH     = '/jidelnicek-sync.json';
const PUSH_DELAY_MS = 2000;

let _pushTimer  = null;
let _lastPushed = '';
let _lastSyncTs = 0;
let _onSynced   = null;

export function setSyncCallback(fn) { _onSynced = fn; }

export function getSyncId() { return localStorage.getItem(KEY_BASE) || ''; }
export function setSyncId(v) {
  let u = v.trim().replace(/\/+$/, '');
  if (u && !u.startsWith('http')) u = 'https://' + u;
  localStorage.setItem(KEY_BASE, u);
}
export function clearSyncId() { localStorage.removeItem(KEY_BASE); }
export function getLastSyncTs() { return _lastSyncTs; }
export function hasToken() { return true; }

// ── Payload ───────────────────────────────────────────────────────
function buildPayload() {
  return {
    planId:  STATE.currentPlanId,
    ate:     STATE.ate,
    targets: JSON.parse(localStorage.getItem(KEY_TARGETS) || '{}'),
    ts:      Date.now(),
  };
}

function applyRemote(remote) {
  if (!remote) return;
  let changed = false;
  if (remote.planId && remote.planId !== STATE.currentPlanId && STATE.plans[remote.planId]) {
    STATE.currentPlanId = remote.planId;
    persistCurrent();
    changed = true;
  }
  if (remote.ate && typeof remote.ate === 'object') {
    for (const k of Object.keys(remote.ate)) {
      if (remote.ate[k] && !STATE.ate[k]) { STATE.ate[k] = true; changed = true; }
    }
    if (changed) persistAte();
  }
  if (remote.targets && typeof remote.targets === 'object') {
    const localTs = parseInt(localStorage.getItem(KEY_LOCAL_TS) || '0', 10);
    if ((remote.ts || 0) > localTs) {
      localStorage.setItem(KEY_TARGETS, JSON.stringify(remote.targets));
      changed = true;
    }
  }
  if (changed && _onSynced) _onSynced();
}

// ── Public API ────────────────────────────────────────────────────
export async function pullSync() {
  const base = getSyncId();
  if (!base) return 'no-id';
  try {
    const res = await fetch(base + SYNC_PATH);
    if (!res.ok) return `error:HTTP ${res.status}`;
    const data = await res.json();
    applyRemote(data);
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) { return 'error:' + e.message; }
}

export async function pushNow() {
  const base = getSyncId();
  if (!base) return 'no-id';
  const payload    = buildPayload();
  const serialized = JSON.stringify(payload);
  if (serialized === _lastPushed) return 'skip';
  try {
    const res = await fetch(base + SYNC_PATH, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    serialized,
    });
    if (!res.ok) return `error:HTTP ${res.status}`;
    _lastPushed = serialized;
    localStorage.setItem(KEY_LOCAL_TS, String(payload.ts));
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) { return 'error:' + e.message; }
}

export function schedulePush() {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => pushNow(), PUSH_DELAY_MS);
}

export async function syncInit() {
  const base = getSyncId();
  if (base) { await pullSync(); return base; }
  return '';
}
