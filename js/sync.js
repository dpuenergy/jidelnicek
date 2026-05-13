import { STATE, persistAte, persistCurrent, KEY_TARGETS } from './state.js';

const BLOB_KEY      = 'sync_blob_id';
const BLOB_API      = 'https://jsonblob.com/api/jsonBlob';
const PUSH_DELAY_MS = 2000;

let _pushTimer  = null;
let _lastPushed = '';
let _lastSyncTs = 0;
let _onSynced   = null;

export function setSyncCallback(fn) { _onSynced = fn; }
export function getSyncId()  { return localStorage.getItem(BLOB_KEY) || ''; }
export function setSyncId(id){ localStorage.setItem(BLOB_KEY, id.trim()); }
export function clearSyncId(){ localStorage.removeItem(BLOB_KEY); }
export function getLastSyncTs() { return _lastSyncTs; }
export function hasToken() { return true; }  // jsonblob nepotřebuje token

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
    const localTs  = parseInt(localStorage.getItem('sync_local_ts') || '0', 10);
    if ((remote.ts || 0) > localTs) {
      localStorage.setItem(KEY_TARGETS, JSON.stringify(remote.targets));
      changed = true;
    }
  }
  if (changed && _onSynced) _onSynced();
}

// ── Public API ────────────────────────────────────────────────────
export async function pullSync() {
  const id = getSyncId();
  if (!id) return 'no-id';
  try {
    const res = await fetch(`${BLOB_API}/${id}`);
    if (res.status === 404) { clearSyncId(); return 'no-id'; }
    if (!res.ok) return `error:HTTP ${res.status}`;
    applyRemote(await res.json());
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) { return 'error:' + e.message; }
}

export async function pushNow() {
  let id = getSyncId();
  const payload = buildPayload();
  const serialized = JSON.stringify(payload);
  if (serialized === _lastPushed && id) return 'skip';
  try {
    let res;
    if (!id) {
      // Vytvoř nový blob
      res = await fetch(BLOB_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      });
      if (!res.ok) return `error:create HTTP ${res.status}`;
      // ID je v URL z Location headeru nebo z těla
      const location = res.headers.get('X-jsonblob') || res.headers.get('Location') || '';
      id = location.split('/').pop();
      if (!id) return 'error:blob ID nezískan';
      setSyncId(id);
    } else {
      res = await fetch(`${BLOB_API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      });
      if (res.status === 404) {
        clearSyncId();
        return pushNow();  // rekurze — vytvoří nový
      }
      if (!res.ok) return `error:update HTTP ${res.status}`;
    }
    _lastPushed = serialized;
    localStorage.setItem('sync_local_ts', String(payload.ts));
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) { return 'error:' + e.message; }
}

export function schedulePush() {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => pushNow(), PUSH_DELAY_MS);
}

export async function syncInit() {
  const id = getSyncId();
  if (id) { await pullSync(); return id; }
  return '';  // ID vytvoří první pushNow
}
