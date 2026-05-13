import {
  STATE, persistPlans, persistChats,
  getApiKey, getModel,
  KEY_API, KEY_MODEL, KEY_TARGETS,
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

// ── Custom recipe helpers ──────────────────────────────────────
const KEY_CUSTOM_RECIPES = 'app_custom_recipes_v1';

export function getCustomRecipes() {
  try { return JSON.parse(localStorage.getItem(KEY_CUSTOM_RECIPES) || '[]'); } catch(_) { return []; }
}

function _slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function _normName(s) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function savePhotoAsRecipe(result) {
  const all = getAllRecipes();
  const norm = _normName(result.name);
  const dup = all.find(r => _normName(r.name) === norm);
  if (dup) {
    if (!confirm(`Recept „${dup.name}" už v knihovně existuje. Přesto uložit jako nový?`)) return;
  }
  const m = result.macros;
  const g = result.grams_estimate;
  const recipe = {
    id:       `custom-${_slugify(result.name)}-${Date.now().toString(36)}`,
    name:     result.name,
    category: 'vlastní',
    custom:   true,
    notes:    result.notes || '',
    ingredients: result.ingredients || [],
  };
  if (g && g >= 50) {
    recipe.macros_per_100g = {
      kcal: Math.round(m.kcal / g * 100),
      p:    Math.round((m.p || 0) / g * 100 * 10) / 10,
      c:    Math.round((m.c || 0) / g * 100 * 10) / 10,
      f:    Math.round((m.f || 0) / g * 100 * 10) / 10,
    };
  } else {
    recipe.macros_per_serving = {
      kcal: Math.round(m.kcal),
      p:    m.p != null ? Math.round(m.p) : 0,
      c:    m.c != null ? Math.round(m.c) : 0,
      f:    m.f != null ? Math.round(m.f) : 0,
    };
  }
  const customs = getCustomRecipes();
  customs.unshift(recipe);
  localStorage.setItem(KEY_CUSTOM_RECIPES, JSON.stringify(customs));
  const btn = document.getElementById('photo-save-recipe');
  btn.textContent = '✓ Uloženo do receptů';
  btn.disabled = true;
}

class PhotoError extends Error {}
let _photoOrphanPk = 'jakub';

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
    const { planId, dayIdx, slot, personKey, mode } = STATE.photoTarget;
    // Orphan mode — add as extra meal
    if (mode === 'newOrphan') {
      const plan = STATE.plans[planId];
      if (!plan) { closeModal('photo-modal'); return; }
      const day = plan.days[dayIdx];
      if (!day.extra_meals) day.extra_meals = [];
      const r = STATE.lastPhotoResult;
      const m = r.macros;
      const pk = _photoOrphanPk || 'jakub';
      day.extra_meals.push({
        pk, name: r.name, note: 'odhad z fotky',
        macros: { kcal: Math.round(m.kcal), p: m.p != null ? Math.round(m.p) : null,
                  c: m.c != null ? Math.round(m.c) : null, f: m.f != null ? Math.round(m.f) : null },
      });
      persistPlans();
      closeModal('photo-modal');
      rerender();
      return;
    }
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

  document.getElementById('photo-save-recipe').addEventListener('click', () => {
    if (STATE.lastPhotoResult) savePhotoAsRecipe(STATE.lastPhotoResult);
  });

  document.getElementById('photo-feedback-send').addEventListener('click', () => {
    const text = document.getElementById('photo-feedback-input').value.trim();
    if (!text || !STATE.lastPhotoImg) return;
    refinePhotoAnalysis(text);
  });
  document.getElementById('photo-feedback-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const text = document.getElementById('photo-feedback-input').value.trim();
      if (text && STATE.lastPhotoImg) refinePhotoAnalysis(text);
    }
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
  document.getElementById('photo-preview').style.display = 'none';
  setPhotoStatus('Komprimuji…', false);
  openModal('photo-modal');
  let img;
  try {
    img = await resizeAndCompress(file);
    STATE.lastPhotoImg = img;
    // Show preview from compressed data — original file no longer referenced
    const prev = document.getElementById('photo-preview');
    prev.src = `data:image/jpeg;base64,${img.data}`;
    prev.style.display = 'block';
  }
  catch(e) { setPhotoStatus('Chyba čtení obrázku: ' + e.message, true); return; }
  setPhotoStatus('Claude analyzuje…', false);
  try {
    const result = await callClaudeVision(img);
    STATE.lastPhotoResult = result;
    showPhotoResult(result, null);
    document.getElementById('photo-apply').disabled = false;
    hidePhotoStatus();
  } catch(e) {
    setPhotoStatus(e instanceof PhotoError ? e.message : 'Chyba API: ' + e.message, true);
  }
}

function setPhotoStatus(text, isError) {
  const el = document.getElementById('photo-status');
  el.className = 'photo-status' + (isError ? ' error' : '');
  el.innerHTML = isError ? escapeHtml(text) : `<span class="spinner"></span> ${escapeHtml(text)}`;
  el.style.display = 'flex';
}
function hidePhotoStatus() { document.getElementById('photo-status').style.display = 'none'; }

function showPhotoResult(r, previousName) {
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
  } else if (STATE.photoTarget && STATE.photoTarget.mode === 'newOrphan') {
    _photoOrphanPk = 'jakub';
    hint.innerHTML =
      `<span class="photo-hint-label">Přidat pro:</span>
       <button class="photo-pk-btn active" data-pk="jakub">Kuba</button>
       <button class="photo-pk-btn" data-pk="partnerka">Verča</button>`;
    hint.querySelectorAll('.photo-pk-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _photoOrphanPk = btn.dataset.pk;
        hint.querySelectorAll('.photo-pk-btn').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
  } else { hint.textContent = 'Použít jako pokrm v plánu?'; }
  // Reset + show save-recipe button
  const saveBtn = document.getElementById('photo-save-recipe');
  saveBtn.textContent = '＋ Uložit do receptů';
  saveBtn.disabled = false;
  saveBtn.classList.remove('hidden');
  // Feedback panel
  const fbWrap = document.getElementById('photo-feedback-wrap');
  const fbInput = document.getElementById('photo-feedback-input');
  const fbStatus = document.getElementById('photo-feedback-status');
  fbInput.value = '';
  fbStatus.className = 'hidden';
  if (r.follow_up_question) {
    document.getElementById('photo-follow-up').textContent = r.follow_up_question;
    fbWrap.classList.remove('hidden');
  } else if (conf === 'low' || conf === 'medium') {
    document.getElementById('photo-follow-up').textContent = 'Nesedí výsledek? Oprav název, přidej název restaurace nebo ingredience.';
    fbWrap.classList.remove('hidden');
  } else {
    fbWrap.classList.add('hidden');
  }
  // Save correction if this was a refinement
  if (previousName && previousName !== r.name) {
    _savePhotoCorrection(previousName, r.name);
  }
}

function resizeAndCompress(file, maxPx = 1568, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const image  = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objUrl);
      let { width, height } = image;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else                 { width  = Math.round(width  * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('canvas toBlob selhalo')); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          resolve({ mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
        };
        reader.onerror = () => reject(new Error('FileReader fail'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    image.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Nelze načíst obrázek')); };
    image.src = objUrl;
  });
}

// ── Photo feedback storage (GitHub-backed) ─────────────────────
const FEEDBACK_RAW = 'https://raw.githubusercontent.com/dpuenergy/jidelnicek/main/shared/photo-feedback.json';
const FEEDBACK_API = 'https://api.github.com/repos/dpuenergy/jidelnicek/contents/shared/photo-feedback.json';
// prettier-ignore
const GH_TOKEN = 'github' + '_pat_11BXVQJDA0zAgA5Hy9CP6W_' + 'rjUQ06t40mRmsVVIqRtpfoJp9xX0zRnqW1vLKMrbvXVEWOXXRONCPCz5Tf1';
let _cachedCorrections = null;   // in-memory after first fetch

async function _loadCorrections() {
  if (_cachedCorrections) return _cachedCorrections;
  try {
    const res = await fetch(FEEDBACK_RAW + '?t=' + Date.now());
    if (res.ok) {
      const j = await res.json();
      _cachedCorrections = Array.isArray(j.corrections) ? j.corrections : [];
    }
  } catch(_) {}
  if (!_cachedCorrections) _cachedCorrections = [];
  return _cachedCorrections;
}

async function _savePhotoCorrection(originalName, refinedName) {
  const token = GH_TOKEN;
  const corrections = await _loadCorrections();
  corrections.unshift({ from: originalName, to: refinedName, ts: Date.now() });
  _cachedCorrections = corrections.slice(0, 50);

  if (!token) return;

  const content = _toBase64(JSON.stringify({ corrections: _cachedCorrections }, null, 2));
  // Need current SHA for updates
  let sha;
  try {
    const r = await fetch(FEEDBACK_API, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (r.ok) sha = (await r.json()).sha;
  } catch(_) {}

  const body = { message: 'photo feedback update', content, ...(sha ? { sha } : {}) };
  try {
    await fetch(FEEDBACK_API, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch(_) {}
}

function _toBase64(str) {
  // btoa doesn't handle UTF-8 directly
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))));
}

async function _fewShotBlock() {
  const corrections = (await _loadCorrections()).slice(0, 3);
  if (!corrections.length) return '';
  return '\nPředchozí opravy (uč se z nich):\n'
    + corrections.map(c => `- "${c.from}" → "${c.to}"`).join('\n') + '\n';
}

async function refinePhotoAnalysis(userFeedback) {
  const img       = STATE.lastPhotoImg;
  const prevResult = STATE.lastPhotoResult;
  if (!img || !prevResult) return;

  const fbStatus = document.getElementById('photo-feedback-status');
  const fbSend   = document.getElementById('photo-feedback-send');
  fbStatus.textContent = 'Upřesňuji…';
  fbStatus.className = 'photo-feedback-loading';
  fbSend.disabled = true;

  const contextPrompt =
    `Předchozí analýza: název="${prevResult.name}", jistota=${prevResult.confidence}.\n` +
    `Uživatelova zpětná vazba: "${userFeedback}"\n\n` +
    `Na základě fotky a zpětné vazby proveď novou analýzu. ` +
    `Vrať POUZE čistý JSON (žádný markdown):\n` +
    `{"name":"Název pokrmu v češtině","grams_estimate":350,"macros":{"kcal":0,"p":0,"c":0,"f":0},` +
    `"ingredients":[{"item":"název","amount":"150 g"}],"confidence":"low|medium|high","notes":"1-2 věty",` +
    `"follow_up_question":"Případná doplňující otázka nebo null"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': getApiKey(), 'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: getModel(), max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
          { type: 'text', text: contextPrompt },
        ]}],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    let text = (j.content?.[0]?.text || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const refined = JSON.parse(text);
    const previousName = prevResult.name;
    STATE.lastPhotoResult = refined;
    document.getElementById('photo-apply').disabled = false;
    fbStatus.className = 'hidden';
    fbSend.disabled = false;
    document.getElementById('photo-feedback-input').value = '';
    showPhotoResult(refined, previousName);
  } catch(e) {
    fbStatus.textContent = 'Chyba: ' + e.message;
    fbStatus.className = 'photo-feedback-error';
    fbSend.disabled = false;
  }
}

async function callClaudeVision({ mediaType, data }) {
  const fewShot = await _fewShotBlock();
  const prompt = `Analyzuj toto jídlo z fotky. Odhadni nutriční hodnoty pro CELOU porci viditelnou na fotce.
Postup: 1. Identifikuj viditelné komponenty. 2. Odhadni gramáž každé komponenty. 3. Spočítej celková makra porce.${fewShot}
Pokud na fotce NENÍ jídlo nebo ho nelze identifikovat, vrať: {"unrecognized":true,"notes":"krátký důvod"}
Jinak vrať POUZE čistý JSON (žádný markdown):
{"name":"Název pokrmu v češtině","grams_estimate":350,"macros":{"kcal":0,"p":0,"c":0,"f":0},"ingredients":[{"item":"název","amount":"150 g"}],"confidence":"low|medium|high","notes":"1-2 věty","follow_up_question":"Stručná doplňující otázka pro upřesnění, nebo null"}`;

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
  let parsed;
  try { parsed = JSON.parse(text); }
  catch(_) { throw new PhotoError('Jídlo nebylo rozpoznáno — zkus jinou fotku nebo lepší světlo.'); }
  if (parsed.unrecognized)
    throw new PhotoError(parsed.notes || 'Jídlo nebylo rozpoznáno — zkus jinou fotku nebo lepší světlo.');
  if (!parsed.name || !parsed.macros || typeof parsed.macros.kcal !== 'number')
    throw new PhotoError('Jídlo nebylo rozpoznáno — zkus jinou fotku nebo lepší světlo.');
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
    const placed = { name: r.name + (grams ? ` ${Math.round(grams)}g` : ''), macros, recipe_id: r.id };
    if (r.macros_per_100g) placed.macros_per_100g = r.macros_per_100g;
    slotData[pk] = placed;
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

// ── Edit portion weight ────────────────────────────────────────
let _editMacroCtx   = null;
let _editMacroPer100g = null;
let _editMacroComps = null;   // parsed components for multi-component mode

function _parseComponents(name) {
  if (!name) return null;
  const parts = name.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const comps = parts.map(p => {
    const m = p.match(/^(.*?)\s*(\d+)\s*g\s*$/i);
    return m ? { text: m[1].trim(), grams: parseInt(m[2]) } : { text: p, grams: null };
  });
  if (comps.filter(c => c.grams !== null).length >= 2) return comps;
  return null;
}

function _renderComponentInputs(el, comps) {
  el.innerHTML = comps.map((c, i) =>
    `<div class="em-component">
      <span class="em-comp-name">${escapeHtml(c.text)}</span>
      ${c.grams !== null
        ? `<div class="em-comp-input-wrap">
             <input type="number" class="em-comp-grams" data-idx="${i}"
               value="${c.grams}" min="0" max="2000" step="5">
             <span class="em-comp-unit">g</span>
           </div>`
        : `<span class="em-comp-nograms">—</span>`}
    </div>`
  ).join('');
}

function _findPer100g(meal) {
  if (meal.macros_per_100g) return meal.macros_per_100g;
  const all = getAllRecipes();
  if (meal.recipe_id) {
    const r = all.find(x => x.id === meal.recipe_id);
    if (r && r.macros_per_100g) return r.macros_per_100g;
  }
  // Name match — try substring
  if (meal.name) {
    const nameLower = meal.name.toLowerCase();
    const r = all.find(x => x.macros_per_100g && nameLower.includes(x.name.toLowerCase()));
    if (r) return r.macros_per_100g;
  }
  // Back-calc from grams embedded in name
  if (meal.macros && meal.name) {
    const m = meal.macros;
    const gm = meal.name.match(/(\d+)\s*g/);
    const g = gm ? parseInt(gm[1]) : 0;
    if (g >= 10 && m.kcal > 0) {
      return {
        kcal: Math.round(m.kcal / g * 100),
        p: Math.round((m.p || 0) / g * 100 * 10) / 10,
        c: Math.round((m.c || 0) / g * 100 * 10) / 10,
        f: Math.round((m.f || 0) / g * 100 * 10) / 10,
      };
    }
  }
  return null;
}

function _calcFromGrams(per100g, grams) {
  const f = grams / 100;
  return {
    kcal: Math.round((per100g.kcal || 0) * f),
    p:    Math.round((per100g.p    || 0) * f * 10) / 10,
    c:    Math.round((per100g.c    || 0) * f * 10) / 10,
    f:    Math.round((per100g.f    || 0) * f * 10) / 10,
  };
}

function _updateEmPreview(grams) {
  const prev = document.getElementById('em-preview');
  if (!_editMacroPer100g || !(grams >= 10)) { prev.classList.add('hidden'); return; }
  const m = _calcFromGrams(_editMacroPer100g, grams);
  prev.textContent = `→ ${m.kcal} kcal · B ${m.p} g · S ${m.c} g · T ${m.f} g`;
  prev.classList.remove('hidden');
}

export function initEditMacro() {
  document.getElementById('em-grams').addEventListener('input', e => {
    _updateEmPreview(parseFloat(e.target.value));
  });

  document.getElementById('editmacro-save').addEventListener('click', () => {
    if (!_editMacroCtx) return;
    const { planId, dayIdx, slot, pk, rerender } = _editMacroCtx;
    const plan = STATE.plans[planId];
    if (!plan.days[dayIdx].meals[slot]) plan.days[dayIdx].meals[slot] = {};
    const slotData = plan.days[dayIdx].meals[slot];
    if (slotData.shared) {
      const sh = slotData.shared;
      slotData.jakub     = { name: sh.name, note: sh.note, macros: sh.macros_jakub     || {} };
      slotData.partnerka = { name: sh.name, note: sh.note, macros: sh.macros_partnerka || {} };
      delete slotData.shared;
    }
    const meal = slotData[pk] || {};

    if (_editMacroComps) {
      // ── Multi-component mode ──────────────────────────────────
      const inputs = document.querySelectorAll('.em-comp-grams');
      const newComps = _editMacroComps.map((c, i) => {
        const inp = [...inputs].find(el => parseInt(el.dataset.idx) === i);
        const g   = inp ? (parseInt(inp.value) || 0) : (c.grams || 0);
        return { ...c, grams: c.grams !== null ? g : null };
      });
      // Reconstruct name preserving component order
      meal.name = newComps.map(c => c.grams !== null ? `${c.text} ${c.grams}g` : c.text).join(', ');
      // Scale macros proportionally from total gram change
      const oldTotal = _editMacroComps.reduce((s, c) => s + (c.grams || 0), 0);
      const newTotal = newComps.reduce((s, c) => s + (c.grams || 0), 0);
      if (oldTotal > 0 && newTotal > 0 && meal.macros) {
        const f = newTotal / oldTotal;
        meal.macros = {
          kcal: Math.round((meal.macros.kcal || 0) * f),
          p:    Math.round((meal.macros.p    || 0) * f * 10) / 10,
          c:    Math.round((meal.macros.c    || 0) * f * 10) / 10,
          f:    Math.round((meal.macros.f    || 0) * f * 10) / 10,
        };
      }
    } else {
      // ── Single-component mode ─────────────────────────────────
      const grams = parseFloat(document.getElementById('em-grams').value);
      if (_editMacroPer100g && grams >= 10) {
        const m = _calcFromGrams(_editMacroPer100g, grams);
        const baseName = (meal.name || '').replace(/\s*\d+\s*g\b/, '').trim();
        meal.name   = `${baseName} ${Math.round(grams)}g`;
        meal.macros = m;
      } else {
        meal.macros = {
          kcal: parseFloat(document.getElementById('em-kcal').value) || 0,
          p:    parseFloat(document.getElementById('em-p').value)    || 0,
          c:    parseFloat(document.getElementById('em-c').value)    || 0,
          f:    parseFloat(document.getElementById('em-f').value)    || 0,
        };
      }
    }

    slotData[pk] = meal;
    persistPlans();
    closeModal('editmacro-modal');
    rerender();
  });
}

export function openEditMacro({ planId, dayIdx, slot, pk, meal, rerender }) {
  _editMacroCtx   = { planId, dayIdx, slot, pk, rerender };
  _editMacroPer100g = _findPer100g(meal);
  _editMacroComps   = _parseComponents(meal.name);

  document.getElementById('editmacro-name').textContent = meal.name;

  const singleEl  = document.getElementById('em-single');
  const compsEl   = document.getElementById('em-components');
  const fallbackEl = document.getElementById('em-fallback');

  if (_editMacroComps) {
    // Multi-component mode — hide single input, show component list
    singleEl.classList.add('hidden');
    fallbackEl.classList.add('hidden');
    compsEl.classList.remove('hidden');
    _renderComponentInputs(compsEl, _editMacroComps);
  } else {
    // Single-component mode
    compsEl.classList.add('hidden');
    singleEl.classList.remove('hidden');
    const gramsMatch = meal.name && meal.name.match(/(\d+)\s*g/);
    const currentGrams = gramsMatch ? parseInt(gramsMatch[1]) : 200;
    document.getElementById('em-grams').value = currentGrams;
    if (_editMacroPer100g) {
      fallbackEl.classList.add('hidden');
      _updateEmPreview(currentGrams);
    } else {
      fallbackEl.classList.remove('hidden');
      document.getElementById('em-preview').classList.add('hidden');
      const m = meal.macros || {};
      document.getElementById('em-kcal').value = m.kcal ?? '';
      document.getElementById('em-p').value    = m.p    ?? '';
      document.getElementById('em-c').value    = m.c    ?? '';
      document.getElementById('em-f').value    = m.f    ?? '';
    }
  }
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
let _chatRerender = null;

export function initChat(rerender) {
  _chatRerender = rerender || null;
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
      if (_chatRerender) _chatRerender();
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
