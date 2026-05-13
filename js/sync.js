import { STATE, persistAte, persistCurrent, _persistPlansSilent, KEY_TARGETS } from './state.js';

const KEY_BASE      = 'sync_firebase_url';
const KEY_DEVICE_ID = 'sync_device_id';
const KEY_LOCAL_TS  = 'sync_local_ts';
const DEVICES_PATH  = '/jidelnicek-devices';
const PUSH_DELAY_MS = 2000;

let _pushTimer  = null;
let _lastPushed = '';  // stable hash (bez ts) — zabrání ping-pong push loopu
let _lastSyncTs = 0;
let _onSynced   = null;

export function setSyncCallback(fn) { _onSynced = fn; }

function getDeviceId() {
  let id = localStorage.getItem(KEY_DEVICE_ID);
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY_DEVICE_ID, id);
  }
  return id;
}

export function getSyncId()  { return localStorage.getItem(KEY_BASE) || ''; }
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
    plans:   STATE.plans,
    ts:      Date.now(),
  };
}

// ── Pull — čte všechna zařízení, merguje ──────────────────────────
export async function pullSync() {
  const base = getSyncId();
  if (!base) return 'no-id';
  try {
    const res = await fetch(`${base}${DEVICES_PATH}.json`);
    if (!res.ok) return `error:HTTP ${res.status}`;
    const all = await res.json();
    if (!all || typeof all !== 'object') { _lastSyncTs = Date.now(); return 'ok'; }

    const myId         = getDeviceId();
    const myLastPushTs = parseInt(localStorage.getItem(KEY_LOCAL_TS) || '0', 10);
    let changed      = false;
    let plansChanged = false;
    let newestTs     = 0;
    let newest       = null;

    for (const [devId, data] of Object.entries(all)) {
      if (devId === myId || !data) continue;

      // Union-merge ate (nikdy neodstraňuje)
      if (data.ate && typeof data.ate === 'object') {
        for (const k of Object.keys(data.ate)) {
          if (data.ate[k] && !STATE.ate[k]) { STATE.ate[k] = true; changed = true; }
        }
      }

      // Sleduj nejnovější device pro planId + targets
      if ((data.ts || 0) > newestTs) { newestTs = data.ts; newest = data; }

      // Merge plánů: převezmi remote plány pokud remote pushoval po nás
      if (data.plans && typeof data.plans === 'object') {
        const devTs = data.ts || 0;
        if (devTs > myLastPushTs) {
          for (const [pid, rPlan] of Object.entries(data.plans)) {
            STATE.plans[pid] = rPlan;
            plansChanged = true;
          }
        }
      }
    }

    if (changed) persistAte();
    if (plansChanged) {
      _persistPlansSilent();  // uloží do localStorage, netriggeruje push
      schedulePush();         // propaguje mergnuté plány do Firebase
    }

    if (newest) {
      if (newest.planId && newest.planId !== STATE.currentPlanId && STATE.plans[newest.planId]) {
        STATE.currentPlanId = newest.planId;
        persistCurrent();
        changed = true;
      }
      const localTs = parseInt(localStorage.getItem(KEY_LOCAL_TS) || '0', 10);
      if (newestTs > localTs && newest.targets && typeof newest.targets === 'object') {
        localStorage.setItem(KEY_TARGETS, JSON.stringify(newest.targets));
        changed = true;
      }
    }

    if ((changed || plansChanged) && _onSynced) _onSynced();
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) { return 'error:' + e.message; }
}

// ── Push — píše jen do vlastního namespace ─────────────────────────
export async function pushNow() {
  const base = getSyncId();
  if (!base) return 'no-id';
  const payload = buildPayload();
  // Stable hash bez ts — zabrání push loopu když obsah identický
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
  if (base) { await pullSync(); return base; }
  return '';
}
