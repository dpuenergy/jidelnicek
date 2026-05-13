import {
  STATE, persistPlans, persistChats,
  getApiKey, getModel, KEY_API, KEY_MODEL, KEY_TARGETS,
  getTargetOverrides,
} from './state.js';
import { escapeHtml, mealKey } from './helpers.js';
import { getAllRecipes, getMacros } from './render/recipes.js';

const GITHUB_INDEX    = 'https://raw.githubusercontent.com/dpuenergy/jidelnicek/main/shared/index.json';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/dpuenergy/jidelnicek/main/';

// ── Generic ────────────────────────────────────────────────────
export function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
export function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

export function initModalDismiss() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => { if (e.target === bd) bd.classList.add('hidden'); });
  });
}

// ── Settings ───────────────────────────────────────────────────
const TARGET_FIELDS = [
  ['jakub',     ['kcal','p','c','f']],
  ['partnerka', ['kcal','p','c','f']],
];

export function initSettings() {
  document.getElementById('settings-save').addEventListener('click', () => {
    const k = document.getElementById('settings-key').value.trim();
    if (k) localStorage.setItem(KEY_API, k); else localStorage.removeItem(KEY_API);
    localStorage.setItem(KEY_MODEL, document.getElementById('settings-model').value);
    // Save target overrides
    const overrides = {};
    for (const [pk, keys] of TARGET_FIELDS) {
      overrides[pk] = {};
      for (const key of keys) {
        const val = parseFloat(document.getElementById(`tgt-${pk}-${key}`).value);
        if (!isNaN(val) && val > 0) overrides[pk][key] = val;
      }
    }
    localStorage.setItem(KEY_TARGETS, JSON.stringify(overrides));
    closeModal('settings-modal');
  });
}

export function openSettings() {
  document.getElementById('settings-key').value   = getApiKey();
  document.getElementById('settings-model').value = getModel();
  // Load target overrides
  const ov = getTargetOverrides();
  for (const [pk, keys] of TARGET_FIELDS) {
    for (const key of keys) {
      const el = document.getElementById(`tgt-${pk}-${key}`);
      if (el) el.value = (ov[pk] && ov[pk][key]) ? ov[pk][key] : '';
    }
  }
  openModal('settings-modal');
}

// ── Add plan ───────────────────────────────────────────────────
export function initAddPlan(onPlanImported) {
  document.getElementById('addplan-help').addEventListener('click', e => {
    e.preventDefault();
    alert('Použij „Sync z GitHubu" — plány se načtou automaticky.\n\nNebo zkopíruj JSON z BEN-em vygenerovaného souboru a vlož sem.');
  });

  document.getElementById('addplan-sync').addEventListener('click', async function() {
    const btn    = this;
    const listEl = document.getElementById('addplan-sync-list');
    btn.disabled = true; btn.textContent = 'Načítám…';
    listEl.className = 'sync-list-hidden';
    try {
      const res = await fetch(GITHUB_INDEX);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const index     = await res.json();
      const available = (index.plans || []).filter(p => !STATE.plans[p.id]);
      if (available.length === 0) {
        listEl.innerHTML = `<p style="color:var(--ink-soft);font-size:13px;margin:0">Všechny plány jsou již importovány.</p>`;
      } else {
        listEl.innerHTML = available.map(p => `
          <div class="sync-plan-item">
            <div class="sync-info">
              <strong>${escapeHtml(p.title || p.id)}</strong>
              <small>${escapeHtml(p.date_range || '')}</small>
            </div>
            <button type="button" class="sync-import-btn" data-file="${escapeHtml(p.file)}">Importovat</button>
          </div>`).join('');
        listEl.querySelectorAll('.sync-import-btn').forEach(b => {
          b.addEventListener('click', async function() {
            this.disabled = true; this.textContent = 'Načítám…';
            try {
              const r    = await fetch(GITHUB_RAW_BASE + this.dataset.file);
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const plan = await r.json();
              plan._original_days = JSON.parse(JSON.stringify(plan.days));
              STATE.plans[plan.id] = plan;
              persistPlans();
              closeModal('addplan-modal');
              onPlanImported(plan.id);
            } catch(e) { this.textContent = 'Chyba'; this.disabled = false; }
          });
        });
      }
      listEl.className = 'sync-list-visible';
    } catch(e) {
      listEl.innerHTML = `<p style="color:var(--c-over);font-size:12px;margin:0">Chyba: ${escapeHtml(e.message)}</p>`;
      listEl.className = 'sync-list-visible';
    }
    btn.disabled = false; btn.textContent = '↓ Sync z GitHubu';
  });

  document.getElementById('addplan-import').addEventListener('click', () => {
    const txt   = document.getElementById('addplan-json').value.trim();
    const errEl = document.getElementById('addplan-err');
    errEl.style.display = 'none';
    if (!txt) { errEl.textContent = 'Vlož JSON plánu.'; errEl.style.display = 'block'; return; }
    let plan;
    try { plan = JSON.parse(txt); }
    catch(e) { errEl.textContent = 'Neplatný JSON: ' + e.message; errEl.style.display = 'block'; return; }
    if (!plan.id || !plan.persons || !plan.slots || !plan.days || !Array.isArray(plan.days)) {
      errEl.textContent = 'Chybí povinná pole (id, persons, slots, days).';
      errEl.style.display = 'block'; return;
    }
    plan._original_days = JSON.parse(JSON.stringify(plan.days));
    STATE.plans[plan.id] = plan;
    persistPlans();
    closeModal('addplan-modal');
    document.getElementById('addplan-json').value = '';
    onPlanImported(plan.id);
  });
}

export function openAddPlan()  { openModal('addplan-modal'); }

// ── Auto-sync on boot ──────────────────────────────────────────
// Recipe-only plans (days=[]) are always refreshed; week plans only
// if missing. Silent — no UI feedback unless something was imported.
export async function autoSync(onImported) {
  try {
    const res = await fetch(GITHUB_INDEX);
    if (!res.ok) return;
    const index = await res.json();
    let count = 0;
    for (const p of (index.plans || [])) {
      const local = STATE.plans[p.id];
      const isLibrary = local && Array.isArray(local.days) && local.days.length === 0;
      if (local && !isLibrary) continue; // week plan already imported — keep user edits
      try {
        const r = await fetch(GITHUB_RAW_BASE + p.file);
        if (!r.ok) continue;
        const plan = await r.json();
        plan._original_days = JSON.parse(JSON.stringify(plan.days));
        STATE.plans[plan.id] = plan;
        count++;
      } catch(_) { /* network/parse error — skip silently */ }
    }
    if (count > 0) { persistPlans(); onImported(); }
  } catch(_) { /* index fetch failed — offline or github down */ }
}

// ── Action sheet (FAB) ─────────────────────────────────────────
export function initActionSheet(onImportPlan) {
  document.getElementById('fab-btn').addEventListener('click', () => openModal('action-modal'));
  document.getElementById('action-foto').addEventListener('click', () => {
    closeModal('action-modal');
    // photo without slot context — orphan
    STATE.photoTarget = { planId: STATE.currentPlanId, dayIdx: STATE.currentDayIdx, mode: 'newOrphan' };
    openPhotoSource();
  });
  document.getElementById('action-import').addEventListener('click', () => {
    closeModal('action-modal');
    openAddPlan();
  });
}

// ── Photo ──────────────────────────────────────────────────────
export function initPhoto(rerender) {
  document.getElementById('photosrc-camera').addEventListener('click', () => {
    closeModal('photosrc-modal'); document.getElementById('camera-input').click();
  });
  document.getElementById('photosrc-gallery').addEventListener('click', () => {
    closeModal('photosrc-modal'); document.getElementById('gallery-input').click();
  });
  document.getElementById('camera-input').addEventListener('change',  e => handlePhotoFile(e.target.files[0], e.target, rerender));
  document.getElementById('gallery-input').addEventListener('change', e => handlePhotoFile(e.target.files[0], e.target, rerender));

  document.getElementById('photo-apply').addEventListener('click', () => {
    if (!STATE.lastPhotoResult || !STATE.photoTarget) return;
    const { planId, dayIdx, slot, personKey } = STATE.photoTarget;
    if (!planId || !slot || !personKey) { closeModal('photo-modal'); return; }
    const plan     = STATE.plans[planId];
    const slotData = plan.days[dayIdx].meals[slot] || (plan.days[dayIdx].meals[slot] = {});
    if (slotData.shared) {
      const sh = slotData.shared;
      slotData.jakub     = { name: sh.name, note: sh.note, macros: sh.macros_jakub     || {} };
      slotData.partnerka = { name: sh.name, note: sh.note, macros: sh.macros_partnerka || {} };
      delete slotData.shared;
    }
    const r = STATE.lastPhotoResult;
    const m = r.macros;
    slotData[personKey] = {
      name: r.name, note: 'odhad z fotky',
      macros: { kcal: Math.round(m.kcal), p: m.p != null ? Math.round(m.p) : null,
                c: m.c != null ? Math.round(m.c) : null, f: m.f != null ? Math.round(m.f) : null },
    };
    persistPlans();
    closeModal('photo-modal');
    rerender();
  });
}

export function openPhotoSource() {
  if (!getApiKey()) { alert('Claude API klíč není nastaven — spusť node scripts/gen_config.js.'); return; }
  openModal('photosrc-modal');
}

async function handlePhotoFile(file, inputEl, rerender) {
  inputEl.value = '';
  if (!file) return;
  STATE.lastPhotoResult = null;
  document.getElementById('photo-result-wrap').style.display = 'none';
  document.getElementById('photo-apply').disabled = true;
  const prev = document.getElementById('photo-preview');
  prev.src = URL.createObjectURL(file); prev.style.display = 'block';
  setPhotoStatus('Načítám…', false);
  openModal('photo-modal');
  let img;
  try { img = await fileToBase64(file); }
  catch(e) { setPhotoStatus('Chyba čtení obrázku: ' + e.message, true); return; }
  setPhotoStatus('Claude analyzuje…', false);
  try {
    const result = await callClaudeVision(img);
    STATE.lastPhotoResult = result;
    showPhotoResult(result);
    document.getElementById('photo-apply').disabled = false;
    hidePhotoStatus();
  } catch(e) { setPhotoStatus('API chyba: ' + e.message, true); }
}

function setPhotoStatus(text, isError) {
  const el = document.getElementById('photo-status');
  el.className = 'photo-status' + (isError ? ' error' : '');
  el.innerHTML = isError ? escapeHtml(text) : `<span class="spinner"></span> ${escapeHtml(text)}`;
  el.style.display = 'flex';
}
function hidePhotoStatus() { document.getElementById('photo-status').style.display = 'none'; }

function showPhotoResult(r) {
  document.getElementById('photo-name').textContent = r.name;
  const m = r.macros;
  document.getElementById('photo-macros').innerHTML =
    `<strong>${Math.round(m.kcal)}</strong> kcal`
    + (m.p != null ? ` · <strong>${Math.round(m.p)}</strong> B` : '')
    + (m.c != null ? ` · <strong>${Math.round(m.c)}</strong> S` : '')
    + (m.f != null ? ` · <strong>${Math.round(m.f)}</strong> T` : '');
  const conf  = (r.confidence || 'medium').toLowerCase();
  const confEl = document.getElementById('photo-conf');
  confEl.className = 'photo-result-conf ' + conf;
  confEl.textContent = ({ low:'Nízká jistota', medium:'Střední jistota', high:'Vysoká jistota' })[conf] || conf;
  document.getElementById('photo-notes').textContent = r.notes || '';
  document.getElementById('photo-result-wrap').style.display = 'block';
  const hint = document.getElementById('photo-target-hint');
  if (STATE.photoTarget && STATE.photoTarget.mode === 'replace') {
    const plan = STATE.plans[STATE.photoTarget.planId];
    hint.textContent = `Nahradit pokrm ${plan.persons[STATE.photoTarget.personKey].name}?`;
  } else { hint.textContent = 'Použít jako pokrm v plánu?'; }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const url = r.result; const i = url.indexOf(',');
      const mt  = (url.slice(0,i).match(/data:([^;]+);/) || [])[1] || 'image/jpeg';
      resolve({ mediaType: mt, data: url.slice(i+1) });
    };
    r.onerror = () => reject(new Error('FileReader fail'));
    r.readAsDataURL(file);
  });
}

async function callClaudeVision({ mediaType, data }) {
  const prompt = `Analyzuj toto jídlo z fotky a odhadni nutriční hodnoty pro JEDNU porci.
Postup: 1. Identifikuj viditelné komponenty. 2. Odhadni gramáže. 3. Spočítej kcal, bílkoviny, sacharidy, tuky.
Vrať POUZE čistý JSON:
{"name":"popis s gramážemi","macros":{"kcal":0,"p":0,"c":0,"f":0},"confidence":"low|medium|high","notes":"1-2 věty"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': getApiKey(), 'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: getModel(), max_tokens: 1024,
      messages: [{ role:'user', content:[
        { type:'image', source:{ type:'base64', media_type: mediaType, data } },
        { type:'text', text: prompt },
      ]}],
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.error?.message) msg += ' — ' + j.error.message; } catch(_){}
    throw new Error(msg);
  }
  const j = await res.json();
  let text = (j.content?.[0]?.text || '').trim()
    .replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'');
  const parsed = JSON.parse(text);
  if (!parsed.name || !parsed.macros || typeof parsed.macros.kcal !== 'number')
    throw new Error('Neúplná data v odpovědi');
  return parsed;
}

// ── Replace meal with recipe ───────────────────────────────────
let _replaceTarget = null;
let _replaceRecipe = null;

export function initReplace(rerender) {
  const searchEl  = document.getElementById('replace-search');
  const listEl    = document.getElementById('replace-list');
  const weightWrap = document.getElementById('replace-weight-wrap');
  const applyBtn  = document.getElementById('replace-apply');

  searchEl.addEventListener('input', () => _renderReplaceList(searchEl.value, listEl, weightWrap, applyBtn));

  applyBtn.addEventListener('click', () => {
    if (!_replaceTarget || !_replaceRecipe) return;
    const { planId, dayIdx, slot, pk } = _replaceTarget;
    const plan = STATE.plans[planId];
    const r = _replaceRecipe;

    let macros;
    const macroData = getMacros(r);
    if (macroData && macroData.unit === '/100g') {
      const grams = parseFloat(document.getElementById('replace-weight').value) || 200;
      const factor = grams / 100;
      const m = macroData.m;
      macros = {
        kcal: Math.round((m.kcal || 0) * factor),
        p:    Math.round((m.p    || 0) * factor),
        c:    Math.round((m.c    || 0) * factor),
        f:    Math.round((m.f    || 0) * factor),
      };
    } else if (macroData) {
      macros = { ...macroData.m };
    } else {
      macros = {};
    }

    const slotData = plan.days[dayIdx].meals[slot] || (plan.days[dayIdx].meals[slot] = {});
    if (slotData.shared) {
      const sh = slotData.shared;
      slotData.jakub     = { name: sh.name, note: sh.note, macros: sh.macros_jakub     || {} };
      slotData.partnerka = { name: sh.name, note: sh.note, macros: sh.macros_partnerka || {} };
      delete slotData.shared;
    }
    const grams = macroData && macroData.unit === '/100g'
      ? (parseFloat(document.getElementById('replace-weight').value) || 200)
      : null;
    slotData[pk] = { name: r.name + (grams ? ` ${Math.round(grams)}g` : ''), macros };
    persistPlans();
    closeModal('replace-modal');
    rerender();
  });
}

function _renderReplaceList(query, listEl, weightWrap, applyBtn) {
  const q   = query.toLowerCase().trim();
  const all = getAllRecipes();
  const filtered = q
    ? all.filter(r => r.name.toLowerCase().includes(q) || (r.category||'').toLowerCase().includes(q))
    : all;
  listEl.innerHTML = filtered.slice(0, 60).map(r => {
    const md = getMacros(r);
    const sub = md ? `${md.m.kcal} kcal ${md.unit}` : '';
    return `<button class="replace-recipe-btn" data-rid="${escapeHtml(r.id)}">
      <span class="rrb-name">${escapeHtml(r.name)}</span>
      ${sub ? `<span class="rrb-sub">${escapeHtml(sub)}</span>` : ''}
    </button>`;
  }).join('');
  listEl.querySelectorAll('.replace-recipe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = getAllRecipes().find(x => x.id === btn.dataset.rid);
      if (!r) return;
      _replaceRecipe = r;
      listEl.querySelectorAll('.replace-recipe-btn').forEach(b => b.classList.toggle('selected', b === btn));
      const md = getMacros(r);
      if (md && md.unit === '/100g') {
        weightWrap.classList.remove('hidden');
        document.getElementById('replace-weight').value = '200';
      } else {
        weightWrap.classList.add('hidden');
      }
      applyBtn.disabled = false;
    });
  });
}

export function openReplace(target) {
  _replaceTarget = target;
  _replaceRecipe = null;
  document.getElementById('replace-apply').disabled = true;
  document.getElementById('replace-weight-wrap').classList.add('hidden');
  document.getElementById('replace-search').value = '';
  const plan = STATE.plans[target.planId];
  const personName = plan?.persons[target.pk]?.name || target.pk;
  document.getElementById('replace-modal-title').textContent = `Nahradit pokrm — ${personName}`;
  _renderReplaceList(
    '', document.getElementById('replace-list'),
    document.getElementById('replace-weight-wrap'),
    document.getElementById('replace-apply')
  );
  openModal('replace-modal');
}

// ── Edit macros ────────────────────────────────────────────────
let _editMacroCtx = null;

export function initEditMacro() {
  document.getElementById('editmacro-save').addEventListener('click', () => {
    if (!_editMacroCtx) return;
    const { planId, dayIdx, slot, pk, rerender } = _editMacroCtx;
    const plan = STATE.plans[planId];
    const slotData = plan.days[dayIdx].meals[slot] || {};
    if (slotData.shared) {
      const sh = slotData.shared;
      slotData.jakub     = { name: sh.name, note: sh.note, macros: sh.macros_jakub     || {} };
      slotData.partnerka = { name: sh.name, note: sh.note, macros: sh.macros_partnerka || {} };
      delete slotData.shared;
      plan.days[dayIdx].meals[slot] = slotData;
    }
    const meal = slotData[pk] || {};
    meal.macros = {
      kcal: parseFloat(document.getElementById('em-kcal').value) || 0,
      p:    parseFloat(document.getElementById('em-p').value)    || 0,
      c:    parseFloat(document.getElementById('em-c').value)    || 0,
      f:    parseFloat(document.getElementById('em-f').value)    || 0,
    };
    slotData[pk] = meal;
    persistPlans();
    closeModal('editmacro-modal');
    rerender();
  });
}

export function openEditMacro({ planId, dayIdx, slot, pk, meal, rerender }) {
  _editMacroCtx = { planId, dayIdx, slot, pk, rerender };
  document.getElementById('editmacro-name').textContent = meal.name;
  const m = meal.macros || {};
  document.getElementById('em-kcal').value = m.kcal ?? '';
  document.getElementById('em-p').value    = m.p    ?? '';
  document.getElementById('em-c').value    = m.c    ?? '';
  document.getElementById('em-f').value    = m.f    ?? '';
  openModal('editmacro-modal');
}

// ── Extra meal ─────────────────────────────────────────────────
let _extraCtx = null;

export function initExtraMeal() {
  document.getElementById('extra-add').addEventListener('click', () => {
    if (!_extraCtx) return;
    const name = document.getElementById('extra-name').value.trim();
    if (!name) { document.getElementById('extra-name').focus(); return; }
    const { plan, planId, dayIdx, rerender } = _extraCtx;
    const day = plan.days[dayIdx];
    if (!day.extra_meals) day.extra_meals = [];
    const pkEl = document.querySelector('.extra-person-btn.active');
    const pk   = pkEl ? pkEl.dataset.pk : 'jakub';
    day.extra_meals.push({
      pk, name,
      macros: {
        kcal: parseFloat(document.getElementById('extra-kcal').value) || 0,
        p:    parseFloat(document.getElementById('extra-p').value)    || 0,
        c:    parseFloat(document.getElementById('extra-c').value)    || 0,
        f:    parseFloat(document.getElementById('extra-f').value)    || 0,
      },
    });
    persistPlans();
    closeModal('extra-modal');
    rerender();
  });
}

export function openExtraMeal({ plan, planId, dayIdx, rerender }) {
  _extraCtx = { plan, planId, dayIdx, rerender };
  document.getElementById('extra-name').value  = '';
  document.getElementById('extra-kcal').value  = '';
  document.getElementById('extra-p').value     = '';
  document.getElementById('extra-c').value     = '';
  document.getElementById('extra-f').value     = '';
  // Person picker
  const row = document.getElementById('extra-person-row');
  row.innerHTML = Object.entries(plan.persons).map(([pk, p]) =>
    `<button class="extra-person-btn${pk === 'jakub' ? ' active' : ''}" data-pk="${escapeHtml(pk)}">${escapeHtml(p.name)}</button>`
  ).join('');
  row.querySelectorAll('.extra-person-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.extra-person-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  openModal('extra-modal');
  setTimeout(() => document.getElementById('extra-name').focus(), 100);
}

// ── Chat ───────────────────────────────────────────────────────
export function initChat() {
  const input = document.getElementById('chat-input');
  // Auto-expand textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  });
  document.getElementById('chat-send').addEventListener('click', sendChat);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
}

export function openChat(target) {
  if (!getApiKey()) { alert('Claude API klíč není nastaven — spusť node scripts/gen_config.js.'); return; }
  STATE.chatTarget = target;
  const m = target.meal.macros || {};
  document.getElementById('chat-context').innerHTML =
    `<strong>${escapeHtml(target.meal.name)}</strong><br>` +
    [m.kcal != null ? m.kcal+' kcal' : '', m.p != null ? m.p+' B' : '',
     m.c != null ? m.c+' S' : '', m.f != null ? m.f+' T' : ''].filter(Boolean).join(' · ');
  renderChatHistory();
  openModal('chat-modal');
  setTimeout(() => document.getElementById('chat-input').focus(), 100);
}

function chatKey() {
  const t = STATE.chatTarget;
  return mealKey(t.planId, t.dayIdx, t.slot, t.personKey);
}
function renderChatHistory() {
  const hist = STATE.chats[chatKey()] || [];
  const el   = document.getElementById('chat-history');
  el.innerHTML = hist.map(msg => {
    const isUser = msg.role === 'user';
    let displayText = msg.content;
    let macroBtn = '';
    if (!isUser && msg.macroUpdate) {
      const m = msg.macroUpdate;
      macroBtn = `<button class="chat-record-btn" data-macros='${JSON.stringify(m)}'>✓ Zaznamenat makra (${m.kcal} kcal · B${m.p} · S${m.c} · T${m.f})</button>`;
    }
    return `<div class="chat-msg ${isUser ? 'user' : 'assistant'}${msg.error ? ' error' : ''}">${escapeHtml(displayText)}${macroBtn}</div>`;
  }).join('');
  // Wire "Zaznamenat" buttons
  el.querySelectorAll('.chat-record-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = JSON.parse(btn.dataset.macros);
      const t = STATE.chatTarget;
      if (!t || !t.planId || !t.slot) return;
      const plan     = STATE.plans[t.planId];
      const slotData = plan.days[t.dayIdx].meals[t.slot] || {};
      if (slotData.shared) {
        const sh = slotData.shared;
        slotData.jakub     = { name: sh.name, note: sh.note, macros: sh.macros_jakub     || {} };
        slotData.partnerka = { name: sh.name, note: sh.note, macros: sh.macros_partnerka || {} };
        delete slotData.shared;
      }
      const meal = slotData[t.personKey] || {};
      meal.macros = { kcal: m.kcal, p: m.p, c: m.c, f: m.f };
      slotData[t.personKey] = meal;
      plan.days[t.dayIdx].meals[t.slot] = slotData;
      persistPlans();
      btn.textContent = '✓ Zaznamenáno';
      btn.disabled = true;
    });
  });
  el.scrollTop = el.scrollHeight;
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || !STATE.chatTarget) return;
  const key = chatKey();
  if (!STATE.chats[key]) STATE.chats[key] = [];
  STATE.chats[key].push({ role:'user', content: text });
  persistChats();
  input.value = '';
  input.style.height = 'auto';
  renderChatHistory();
  const sendBtn = document.getElementById('chat-send');
  sendBtn.disabled = true;
  STATE.chats[key].push({ role:'assistant', content:'…' });
  renderChatHistory();
  try {
    const raw = await callClaudeChat(STATE.chats[key].slice(0,-1));
    STATE.chats[key].pop();
    // Detect MAKRA:{...} pattern
    const macroMatch = raw.match(/MAKRA:\s*(\{[^}]+\})/);
    if (macroMatch) {
      try {
        const m = JSON.parse(macroMatch[1]);
        const displayText = raw.replace(/MAKRA:\s*\{[^}]+\}/, '').trim();
        STATE.chats[key].push({ role:'assistant', content: displayText, macroUpdate: m });
      } catch(_) {
        STATE.chats[key].push({ role:'assistant', content: raw });
      }
    } else {
      STATE.chats[key].push({ role:'assistant', content: raw });
    }
  } catch(e) {
    STATE.chats[key].pop();
    STATE.chats[key].push({ role:'assistant', content:'Chyba: '+e.message, error:true });
  }
  persistChats(); renderChatHistory(); sendBtn.disabled = false;
}

async function callClaudeChat(history) {
  const t = STATE.chatTarget; const m = t.meal.macros || {};
  const system = `Jsi výživový asistent. Pokrm: ${t.meal.name} — ${m.kcal} kcal, ${m.p}g B, ${m.c}g S, ${m.f}g T. Odpovídej stručně česky. Pokud uživatel žádá o úpravu gramáže nebo maker pokrmu a ty navrhuješ konkrétní nové hodnoty, přidej na konec odpovědi (na samostatný řádek) token: MAKRA:{"kcal":X,"p":X,"c":X,"f":X}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key': getApiKey(), 'anthropic-version':'2023-06-01',
              'content-type':'application/json', 'anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model: getModel(), max_tokens:800, system,
      messages: history.map(msg => ({ role:msg.role, content:msg.content })) }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.error?.message) msg += ' — ' + j.error.message; } catch(_){}
    throw new Error(msg);
  }
  const j = await res.json();
  return (j.content?.[0]?.text || '').trim();
}
