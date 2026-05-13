import { GITHUB_TOKEN } from './config.js';
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
const GH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function gistFetch(gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: GH_HEADERS });
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
    headers: GH_HEADERS,
    body: JSON.stringify({
      description: 'Jídelníček sync',
      public: false,
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
    headers: GH_HEADERS,
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

/** Pull latest state from Gist and apply. */
export async function pullSync() {
  const id = getSyncId();
  if (!id) return;
  try {
    const remote = await gistFetch(id);
    applyRemote(remote);
  } catch (_) { /* offline or token error — silent */ }
}

/** Schedule a debounced push of current state to Gist. */
export function schedulePush() {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(async () => {
    const id = getSyncId();
    if (!id) return;
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === _lastPushed) return;
    _lastPushed = serialized;
    localStorage.setItem('sync_local_ts', String(payload.ts));
    try { await gistPatch(id, payload); } catch (_) { /* silent */ }
  }, PUSH_DELAY_MS);
}

/**
 * Called once on app boot.
 * - If no Gist ID set: creates a new Gist, saves ID.
 * - If ID set: pulls remote and merges.
 * Returns the Gist ID.
 */
export async function syncInit() {
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
