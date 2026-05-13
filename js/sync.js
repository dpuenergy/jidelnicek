import { STATE, persistPlans, persistAte, persistCurrent, KEY_TARGETS } from './state.js';

const GIST_KEY      = 'sync_gist_id';
const GIST_FILENAME = 'jidelnicek-sync.json';
const PUSH_DELAY_MS = 2000;

let _pushTimer  = null;
let _lastPushed = '';
let _onSynced   = null;  // callback after successful pull that changed state

export function setSyncCallback(fn) { _onSynced = fn; }

// ── Gist ID storage ───────────────────────────────────────────────
export function getSyncId()        { return localStorage.getItem(GIST_KEY) || ''; }
export function setSyncId(id)      { localStorage.setItem(GIST_KEY, id.trim()); }
export function clearSyncId()      { localStorage.removeItem(GIST_KEY); }

// ── GitHub Gist API helpers ───────────────────────────────────────
function ghHeaders() {
  const token = localStorage.getItem('github_token') || '';
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function hasToken() { return !!(localStorage.getItem('github_token') || '').trim(); }

async function gistFetch(gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`);
  if (!res.ok) throw new Error(`gist fetch ${res.status}`);
  const data = await res.json();
  const raw = data.files[GIST_FILENAME]?.content;
  if (!raw) throw new Error('gist file missing');
  return JSON.parse(raw);
}

async function gistCreate() {
  const payload = buildPayload();
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({
      description: 'Jídelníček sync',
      public: true,
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } },
    }),
  });
  if (!res.ok) throw new Error(`gist create ${res.status}`);
  const data = await res.json();
  return data.id;
}

async function gistPatch(gistId, payload) {
  await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: ghHeaders(),
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } },
    }),
  });
}

// ── Payload build / apply ─────────────────────────────────────────
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

  // planId: remote wins only if it references a known plan
  if (remote.planId && remote.planId !== STATE.currentPlanId && STATE.plans[remote.planId]) {
    STATE.currentPlanId = remote.planId;
    persistCurrent();
    changed = true;
  }

  // ate: union merge — once eaten, stays eaten on both sides
  if (remote.ate && typeof remote.ate === 'object') {
    const merged = { ...remote.ate, ...STATE.ate };
    // keep only truthy values from remote not in local
    for (const k of Object.keys(remote.ate)) {
      if (remote.ate[k] && !STATE.ate[k]) { STATE.ate[k] = true; changed = true; }
    }
    if (changed) persistAte();
  }

  // targets: remote wins (last-write-wins)
  if (remote.targets && typeof remote.targets === 'object') {
    const localTs  = parseInt(localStorage.getItem('sync_local_ts') || '0', 10);
    const remoteTs = remote.ts || 0;
    if (remoteTs > localTs) {
      localStorage.setItem(KEY_TARGETS, JSON.stringify(remote.targets));
      changed = true;
    }
  }

  if (changed && _onSynced) _onSynced();
}

// ── Public API ────────────────────────────────────────────────────

let _lastSyncTs = 0;
export function getLastSyncTs() { return _lastSyncTs; }

/** Pull latest state from Gist and apply. Returns 'ok'|'no-id'|'error'. */
export async function pullSync() {
  const id = getSyncId();
  if (!id) return 'no-id';
  try {
    const remote = await gistFetch(id);
    applyRemote(remote);
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) {
    return 'error:' + e.message;
  }
}

/** Immediately push current state to Gist. Returns 'ok'|'no-id'|'skip'|'error'. */
export async function pushNow() {
  const id = getSyncId();
  if (!id) return 'no-id';
  if (!hasToken()) return 'no-token';
  const payload = buildPayload();
  const serialized = JSON.stringify(payload);
  if (serialized === _lastPushed) return 'skip';
  _lastPushed = serialized;
  localStorage.setItem('sync_local_ts', String(payload.ts));
  try {
    await gistPatch(id, payload);
    _lastSyncTs = Date.now();
    return 'ok';
  } catch (e) {
    return 'error:' + e.message;
  }
}

/** Schedule a debounced push of current state to Gist. */
export function schedulePush() {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => pushNow(), PUSH_DELAY_MS);
}

/**
 * Called once on app boot.
 * - If no Gist ID set: creates a new Gist, saves ID.
 * - If ID set: pulls remote and merges.
 * Returns the Gist ID.
 */
export async function syncInit() {
  if (!hasToken()) return '';  // bez tokenu nelze nic dělat
  let id = getSyncId();
  if (!id) {
    try {
      id = await gistCreate();
      setSyncId(id);
    } catch (_) { return ''; }
  } else {
    await pullSync();
  }
  return id;
}
