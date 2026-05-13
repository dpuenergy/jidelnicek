import { STATE, persistAte, persistCurrent, _persistPlansSilent, KEY_TARGETS } from './state.js';

const KEY_BASE      = 'sync_firebase_url';
const KEY_DEVICE_ID = 'sync_device_id';
const KEY_LOCAL_TS  = 'sync_local_ts';
const DEVICES_PATH  = '/jidelnicek-devices';
const PUSH_DELAY_MS = 2000;

let _pushTimer  = null;
let _lastPushed = '';
let _lastSyncTs = 0;
let _onSynced   = null;
let _sse        = null;

export function setSyncCallback(fn) { _onSynced = fn; }

function getDeviceId() {
  let id = localStorage.getItem(KEY_DEVICE_ID);
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY_DEVICE_ID, id);
  }
  return id;
}

export function getSyncId() { return localStorage.getItem(KEY_BASE) || ''; }
export function setSyncId(v) {
  let u = v.trim().replace(/\/+$/, '');
  if (u && !u.startsWith('http')) u = 'https://' + u;
  localStorage.setItem(KEY_BASE, u);
  _startSSE();
}
export function clearSyncId() {
  localStorage.removeItem(KEY_BASE);
  if (_sse) { _sse.close(); _sse = null; }
}
export function getLastSyncTs() { return _lastSyncTs; }
export function hasToken() { return true; }

// ── Merge jednoho zařízení do lokálního stavu ─────────────────────
function _mergeDevice(devId, data) {
  if (!data || devId === getDeviceId()) return;
  const myLastPushTs = parseInt(localStorage.getItem(KEY_LOCAL_TS) || '0', 10);
  let changed = false, plansChanged = false;

  // ate — union merge (nikdy neodstraňuje)
  if (data.ate && typeof data.ate === 'object') {
    for (const k of Object.keys(data.ate)) {
      if (data.ate[k] && !STATE.ate[k]) { STATE.ate[k] = true; changed = true; }
    }
  }

  const devTs = data.ts || 0;

  // Plány — převezmi pokud remote pushoval po nás
  if (data.plans && typeof data.plans === 'object' && devTs > myLastPushTs) {
    for (const [pid, rPlan] of Object.entries(data.plans)) {
      STATE.plans[pid] = rPlan; plansChanged = true;
    }
  }

  // planId a targets — pokud remote pushoval po nás
  if (devTs > myLastPushTs) {
    if (data.planId && data.planId !== STATE.currentPlanId && STATE.plans[data.planId]) {
      STATE.currentPlanId = data.planId; persistCurrent(); changed = true;
    }
    if (data.targets && typeof data.targets === 'object') {
      localStorage.setItem(KEY_TARGETS, JSON.stringify(data.targets)); changed = true;
    }
  }

  if (changed) persistAte();
  if (plansChanged) { _persistPlansSilent(); schedulePush(); }
  if ((changed || plansChanged) && _onSynced) _onSynced();
  _lastSyncTs = Date.now();
}

// ── SSE — real-time push z Firebase ──────────────────────────────
function _startSSE() {
  const base = getSyncId();
  if (!base) return;
  if (_sse) { _sse.close(); _sse = null; }

  _sse = new EventSource(`${base}${DEVICES_PATH}.json`);

  // Úvodní put: Firebase pošle celý strom (všechna zařízení)
  _sse.addEventListener('put', e => {
    try {
      const { path, data } = JSON.parse(e.data);
      if (path === '/' && data && typeof data === 'object') {
        for (const [id, d] of Object.entries(data)) _mergeDevice(id, d);
      }
    } catch {}
  });

  // Patch: Firebase pošle změnu jednoho zařízení (path = "/{devId}")
  _sse.addEventListener('patch', e => {
    try {
      const { path, data } = JSON.parse(e.data);
      const devId = path.replace(/^\//, '').split('/')[0];
      if (devId) _mergeDevice(devId, data);
    } catch {}
  });

  // EventSource se reconnectuje automaticky při výpadku (SSE spec)
}

// ── Payload ───────────────────────────────────────────────────────
function buildPayload() {
  return {
    planId:  STATE.currentPlanId,
    ate:     STATE.ate,
    targets: JSON.parse(localStorage.getItem(KEY_TARGETS) || '{}'),
    plans:   STATE.plans,
    ts:      Date.now(),
  };
}

// ── Pull — počáteční sync + fallback při výpadku SSE ─────────────
export async function pullSync() {
  const base = getSyncId();
  if (!base) return 'no-id';
  try {
    const res = await fetch(`${base}${DEVICES_PATH}.json`);
    if (!res.ok) return `error:HTTP ${res.status}`;
    const all = await res.json();
    if (all && typeof all === 'object') {
      for (const [id, data] of Object.entries(all)) _mergeDevice(id, data);
    }
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) { return 'error:' + e.message; }
}

// ── Push — jen do vlastního namespace ────────────────────────────
export async function pushNow() {
  const base = getSyncId();
  if (!base) return 'no-id';
  const payload = buildPayload();
  // Stable hash bez ts — zabrání ping-pong push loopu
  const stable = JSON.stringify({ ...payload, ts: 0 });
  if (stable === _lastPushed) return 'skip';
  try {
    const devId = getDeviceId();
    const res = await fetch(`${base}${DEVICES_PATH}/${devId}.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) return `error:HTTP ${res.status}`;
    _lastPushed = stable;
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
  if (!base) return '';
  await pullSync();
  _startSSE();
  return base;
}
