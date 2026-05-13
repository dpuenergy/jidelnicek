import { STATE, persistAte, persistCurrent, persistPlans, getEffectiveTargets } from '../state.js';
import {
  escapeHtml, activeMetricsFor, computeDayTotals,
  computeEatenTotals, mealKey, slotIcon, ICONS, buildTimeline,
} from '../helpers.js';

// Accordion state: set of expanded slotKeys for current day
let _expanded = new Set();
let _lastDayKey = null;

function dayKey() { return `${STATE.currentPlanId}:${STATE.currentDayIdx}`; }

function ensureFreshExpanded() {
  const k = dayKey();
  if (k !== _lastDayKey) { _expanded = new Set(); _lastDayKey = k; }
}

// ── Hero circle SVG ────────────────────────────────────────────
function heroCircleHTML(eaten, total, sizeClass = '') {
  const R = sizeClass === 'small' ? 34 : 48;
  const cx = sizeClass === 'small' ? 42 : 60;
  const SIZE = cx * 2;
  const C = 2 * Math.PI * R;
  const over = total > 0 && eaten > total * 1.05;
  const visualRatio = total > 0 ? Math.min(eaten / total, 1) : 0;
  const dash  = (visualRatio * C).toFixed(1);
  const gap   = (C - parseFloat(dash)).toFixed(1);
  const pct   = total > 0 ? Math.round((eaten / total) * 100) : 0;
  const stroke = over ? 'var(--c-over)' : 'var(--accent)';
  const sw = sizeClass === 'small' ? 6 : 8;

  return `<div class="hero-circle${sizeClass ? ' ' + sizeClass : ''}${over ? ' over' : ''}">
    <svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cx}" r="${R}" fill="none"
        stroke="var(--rule-soft)" stroke-width="${sw}"/>
      <circle cx="${cx}" cy="${cx}" r="${R}" fill="none"
        stroke="${stroke}" stroke-width="${sw}"
        stroke-linecap="round"
        stroke-dasharray="${dash} ${gap}"
        style="transition:stroke-dasharray .4s ease"/>
    </svg>
    <div class="hero-center">
      <span class="hero-kcal">${Math.round(eaten)}</span>
      <span class="hero-target">/ ${Math.round(total)}</span>
      <span class="hero-pct${over ? ' over' : ''}">${pct}%</span>
    </div>
  </div>`;
}

// ── Hero section ───────────────────────────────────────────────
function heroHTML(plan, day, dayIdx, planId) {
  const pf      = STATE.personFilter;
  const persons = pf === 'both' ? ['jakub','partnerka'] : [pf];
  const totals  = computeDayTotals(plan, day);
  const eaten   = computeEatenTotals(plan, day, dayIdx, planId, STATE.ate);

  const pfBtns = ['both','jakub','partnerka'].map(v => {
    const label = v === 'both'
      ? 'Oba'
      : escapeHtml(plan.persons[v].name);
    return `<button class="pf-btn${pf === v ? ' active' : ''}" data-pf="${v}">${label}</button>`;
  }).join('');

  let circlesHTML;
  if (persons.length === 1) {
    const pk = persons[0];
    const tgt = getEffectiveTargets(plan, pk).kcal || 0;
    circlesHTML = `<div class="hero-circle-item">
      <span class="hero-person-name">${escapeHtml(plan.persons[pk].name)}</span>
      ${heroCircleHTML(eaten[pk].kcal, tgt)}
    </div>`;
  } else {
    circlesHTML = persons.map(pk => {
      const tgt = getEffectiveTargets(plan, pk).kcal || 0;
      return `<div class="hero-circle-item">
        <span class="hero-person-name">${escapeHtml(plan.persons[pk].name)}</span>
        ${heroCircleHTML(eaten[pk].kcal, tgt, 'small')}
      </div>`;
    }).join('');
  }

  const eatenRow = persons.map(pk =>
    `<span><strong>${Math.round(eaten[pk].kcal)}</strong> snědeno · ${Math.round(totals[pk].kcal - eaten[pk].kcal)} zbývá</span>`
  ).join(' &nbsp;·&nbsp; ');

  return `<div class="hero-wrap">
    <div class="person-filter">${pfBtns}</div>
    <div class="hero-circles">${circlesHTML}</div>
    <div class="hero-eaten-row">${eatenRow}</div>
  </div>`;
}

// ── Slot kcal summary (collapsed row) ─────────────────────────
function slotKcalSummary(plan, slot, persons) {
  const parts = persons.map(pk => {
    let kcal = 0;
    if (slot.shared) {
      const m = slot.shared['macros_'+pk];
      kcal = (m && m.kcal) || 0;
    } else if (slot[pk] && slot[pk].macros) {
      kcal = slot[pk].macros.kcal || 0;
    }
    return kcal > 0 ? `${escapeHtml(plan.persons[pk].label)}: ${Math.round(kcal)}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(' / ') + ' kcal' : '';
}

// ── Single meal card HTML ──────────────────────────────────────
function mealCardHTML(plan, slotKey, pk, meal, dayIdx, planId) {
  const key  = mealKey(planId, dayIdx, slotKey, pk);
  const isEaten = !!STATE.ate[key];
  const isPlaceholder = meal.type === 'placeholder';
  const m = meal.macros || {};
  const macroLine = [
    m.kcal != null ? `<strong>${m.kcal}</strong> kcal` : '',
    m.p    != null ? `<strong>${m.p}</strong> B` : '',
    m.c    != null ? `<strong>${m.c}</strong> S` : '',
    m.f    != null ? `<strong>${m.f}</strong> T` : '',
  ].filter(Boolean).join(' · ');

  return `<div class="meal-card${isEaten ? ' eaten' : ''}${isPlaceholder ? ' placeholder' : ''}" data-key="${key}">
    <span class="meal-person">${escapeHtml(plan.persons[pk].name)}</span>
    <div class="meal-name">${escapeHtml(meal.name)}</div>
    ${meal.note ? `<div class="meal-note">${escapeHtml(meal.note)}</div>` : ''}
    <div class="meal-macros">${macroLine}</div>
    <div class="meal-actions">
      <button class="eaten-btn${isEaten ? ' is-eaten' : ''}" data-act="eat" data-key="${key}">${isEaten ? '✓ Snědeno' : 'Snědeno'}</button>
      <button data-act="replace" data-slot="${slotKey}" data-person="${pk}">↔ Nahradit</button>
      <button data-act="editmacro" data-slot="${slotKey}" data-person="${pk}">✎ Gramáž</button>
      <button data-act="chat"  data-slot="${slotKey}" data-person="${pk}">${ICONS.chat} Otázka</button>
      <button data-act="photo" data-slot="${slotKey}" data-person="${pk}">${ICONS.camera} Foto</button>
      <button data-act="move"  data-slot="${slotKey}" data-person="${pk}">${ICONS.move} Přesun</button>
      <button data-act="reset"   data-slot="${slotKey}" data-person="${pk}">${ICONS.reset} Reset</button>
      <button data-act="discard" data-slot="${slotKey}" data-person="${pk}">✕ Vyřadit</button>
    </div>
  </div>`;
}

// ── Day totals card ────────────────────────────────────────────
function dayTotalsHTML(plan, day, persons) {
  const totals  = computeDayTotals(plan, day);
  const metrics = activeMetricsFor(plan);
  let html = '<div class="day-totals">';
  for (const pk of persons) {
    const t = totals[pk];
    const tgt = getEffectiveTargets(plan, pk);
    html += `<div class="day-totals-person">
      <div class="day-totals-name">${escapeHtml(plan.persons[pk].name)}</div>`;
    for (const m of metrics) {
      const v    = Math.round(t[m.key] || 0);
      const tg   = tgt[m.key] || 0;
      const pct  = tg ? Math.min(v / tg, 1.25) * 80 : 0;
      const over = tg && v > tg * 1.05;
      html += `<div class="metric-row">
        <span class="metric-label">${escapeHtml(m.label)}</span>
        <span class="metric-bar">
          <span class="metric-fill ${m.key}${over ? ' over' : ''}" style="width:${pct.toFixed(1)}%"></span>
          ${tg ? '<span class="metric-target-line"></span>' : ''}
        </span>
        <span class="metric-value${over ? ' over' : ''}">${v}${tg ? ' / '+tg : ''}${m.key === 'kcal' ? '' : ' g'}</span>
      </div>`;
    }
    html += '</div>';
  }
  return html + '</div>';
}

// ── Move meal helpers ──────────────────────────────────────────
function getMealForPerson(day, slotKey, pk) {
  const slot = day.meals[slotKey] || {};
  if (slot.shared) return { name: slot.shared.name, note: slot.shared.note, macros: slot.shared['macros_'+pk] || {}, type: slot.shared.type };
  return slot[pk] ? { ...slot[pk] } : null;
}

function breakShared(day, slotKey) {
  const slot = day.meals[slotKey];
  if (!slot || !slot.shared) return;
  const sh = slot.shared;
  slot.jakub     = { name: sh.name, note: sh.note, macros: sh.macros_jakub     || {} };
  slot.partnerka = { name: sh.name, note: sh.note, macros: sh.macros_partnerka || {} };
  delete slot.shared;
}

function scaleMealName(name, factor) {
  if (Math.abs(factor - 1) < 0.01) return name;
  return name
    .replace(/(\d+(?:[.,]\d+)?)\s*g\b/g,  (_, n) => Math.round(parseFloat(n.replace(',', '.')) * factor) + 'g')
    .replace(/(\d+(?:[.,]\d+)?)\s*ks\b/g, (_, n) => Math.round(parseFloat(n.replace(',', '.')) * factor) + 'ks')
    .replace(/(\d+(?:[.,]\d+)?)\s*×/g,    (_, n) => {
      const s = parseFloat(n.replace(',', '.')) * factor;
      return (Number.isInteger(s) ? s : Math.round(s * 2) / 2) + '×';
    });
}

function applyScale(meal, factor) {
  if (Math.abs(factor - 1) < 0.01) return { ...meal };
  const m = meal.macros || {};
  return {
    ...meal,
    name: scaleMealName(meal.name || '', factor),
    macros: {
      kcal:  m.kcal  != null ? Math.round(m.kcal  * factor) : null,
      p:     m.p     != null ? Math.round(m.p     * factor) : null,
      c:     m.c     != null ? Math.round(m.c     * factor) : null,
      f:     m.f     != null ? Math.round(m.f     * factor) : null,
      fiber: m.fiber != null ? Math.round(m.fiber * factor) : null,
    },
  };
}

function swapMealsAcrossDays(plan, fromDayIdx, fromSlot, toDayIdx, toSlot, pk, factor) {
  const fromDay = plan.days[fromDayIdx];
  const toDay   = plan.days[toDayIdx];
  if (!fromDay.meals[fromSlot]) fromDay.meals[fromSlot] = {};
  if (!toDay.meals[toSlot])     toDay.meals[toSlot]     = {};
  breakShared(fromDay, fromSlot);
  breakShared(toDay,   toSlot);
  const fromMeal = getMealForPerson(fromDay, fromSlot, pk);
  const toMeal   = getMealForPerson(toDay,   toSlot,   pk);
  const scaledFrom = fromMeal ? applyScale(fromMeal, factor)       : null;
  const scaledTo   = toMeal   ? applyScale(toMeal,   1 / factor)   : null;
  if (scaledTo)   fromDay.meals[fromSlot][pk] = scaledTo;   else delete fromDay.meals[fromSlot][pk];
  if (scaledFrom) toDay.meals[toSlot][pk]     = scaledFrom; else delete toDay.meals[toSlot][pk];
}

// 2-step move modal state
let _mv = null;

function _titleShort(name) { return name && name.length > 40 ? name.slice(0, 40) + '…' : name || ''; }

function openMoveModal(plan, day, dayIdx, planId, fromSlot, pk, rerender) {
  const fromMeal = getMealForPerson(day, fromSlot, pk);
  if (!fromMeal) return;
  _mv = { plan, planId, fromDayIdx: dayIdx, fromSlot, pk, rerender };
  document.getElementById('move-modal-title').textContent = `Přesunout: ${_titleShort(fromMeal.name)}`;
  _showDayPicker();
  document.getElementById('move-modal').classList.remove('hidden');
}

function _showDayPicker() {
  const { plan, fromDayIdx } = _mv;
  const list = document.getElementById('move-slot-list');
  list.innerHTML = `<p class="move-step-label">Vyber den:</p>` +
    plan.days.map((d, idx) => `
      <button class="move-day-btn${idx === fromDayIdx ? ' current' : ''}" data-didx="${idx}">
        <span class="move-day-name">${escapeHtml(d.name || '')}</span>
        <span class="move-day-date">${escapeHtml(d.date || '')}</span>
      </button>`).join('');
  list.querySelectorAll('.move-day-btn').forEach(btn =>
    btn.addEventListener('click', () => _showSlotPicker(parseInt(btn.dataset.didx)))
  );
}

function _showSlotPicker(targetDayIdx) {
  const { plan, fromDayIdx, fromSlot, pk } = _mv;
  const targetDay = plan.days[targetDayIdx];
  const list = document.getElementById('move-slot-list');
  list.innerHTML =
    `<button class="move-back-btn" id="move-back">← ${escapeHtml(targetDay.name || '')} ${escapeHtml(targetDay.date || '')}</button>` +
    plan.slots
      .filter(s => !(s === fromSlot && targetDayIdx === fromDayIdx))
      .map(s => {
        const label    = (plan.slot_labels && plan.slot_labels[s]) || s;
        const existing = getMealForPerson(targetDay, s, pk);
        const note     = existing ? `↔ ${escapeHtml(_titleShort(existing.name))}` : 'prázdný slot';
        return `<button class="move-slot-btn" data-to="${escapeHtml(s)}">
          <span class="move-slot-icon">${slotIcon(s)}</span>
          <span class="move-slot-info">
            <span class="move-slot-name">${escapeHtml(label)}</span>
            <span class="move-slot-note">${note}</span>
          </span>
        </button>`;
      }).join('') +
    `<div class="move-scale-row">
      <label class="move-scale-label">Faktor gramáží</label>
      <div class="move-scale-controls">
        <input type="number" id="move-scale-input" class="move-scale-input" value="1.00" min="0.1" max="3" step="0.05">
        <span class="move-scale-hint">1.0 = beze změny · 0.8 = o 20 % méně</span>
      </div>
    </div>`;

  document.getElementById('move-back').addEventListener('click', _showDayPicker);
  list.querySelectorAll('.move-slot-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const factor = parseFloat(document.getElementById('move-scale-input').value) || 1;
      const { plan, fromDayIdx, fromSlot, pk, rerender } = _mv;
      swapMealsAcrossDays(plan, fromDayIdx, fromSlot, targetDayIdx, btn.dataset.to, pk, factor);
      persistPlans();
      document.getElementById('move-modal').classList.add('hidden');
      rerender();
    })
  );
}

// ── Main render ────────────────────────────────────────────────
export function renderDayView(rerender, openPhotoSource, openChat, openReplace, openEditMacro, openExtraMeal) {
  const plan = STATE.currentPlanId ? STATE.plans[STATE.currentPlanId] : null;
  const main = document.getElementById('main');

  if (!plan) {
    main.innerHTML = `<div class="empty-state">
      <h2>Žádný plán</h2>
      <p>Importuj jídelníček, který ti BEN vygeneroval.</p>
      <button class="add-plan-btn" id="empty-add">+ Přidat plán</button>
    </div>`;
    document.getElementById('empty-add')
      .addEventListener('click', () => document.getElementById('fab-btn').click());
    return;
  }

  ensureFreshExpanded();
  const day     = plan.days[STATE.currentDayIdx];
  const planId  = STATE.currentPlanId;
  const dayIdx  = STATE.currentDayIdx;
  const pf      = STATE.personFilter;
  const persons = pf === 'both' ? ['jakub','partnerka'] : [pf];

  let html = heroHTML(plan, day, dayIdx, planId);
  if (day.note) html += `<div class="day-note">${escapeHtml(day.note)}</div>`;

  for (const slotKey of plan.slots) {
    const slot    = day.meals[slotKey] || {};
    const label   = (plan.slot_labels && plan.slot_labels[slotKey]) || slotKey;
    const emoji   = slotIcon(slotKey);
    const expanded = _expanded.has(slotKey);
    const kcalStr  = slotKcalSummary(plan, slot, persons);

    html += `<div class="slot-row${expanded ? ' expanded' : ''}" data-slot="${slotKey}">
      <span class="slot-emoji">${emoji}</span>
      <span class="slot-row-name">${escapeHtml(label)}</span>
      ${kcalStr ? `<span class="slot-row-kcal">${kcalStr}</span>` : ''}
      <span class="slot-chevron">▼</span>
    </div>`;

    html += `<div class="slot-body${expanded ? '' : ' hidden'}" data-slot-body="${slotKey}">`;
    if (slot.shared) {
      for (const pk of persons) {
        html += mealCardHTML(plan, slotKey, pk, {
          name: slot.shared.name, note: slot.shared.note,
          macros: slot.shared['macros_'+pk], type: slot.shared.type,
        }, dayIdx, planId);
      }
    } else {
      for (const pk of persons) {
        const meal = slot[pk];
        if (meal) html += mealCardHTML(plan, slotKey, pk, meal, dayIdx, planId);
      }
    }
    if (!slot.shared && persons.every(pk => !slot[pk])) {
      html += `<p style="font-size:13px;color:var(--ink-faint);padding:4px 2px;margin:0">Prázdný slot</p>`;
    }
    html += '</div>';
  }

  // Extra meals (per-person free-form)
  const extras = day.extra_meals || [];
  const visibleExtras = extras.filter(e => pf === 'both' || e.pk === pf);
  if (visibleExtras.length > 0) {
    html += `<div class="extra-meals-section">
      <div class="extra-meals-label">Extra jídla</div>`;
    visibleExtras.forEach((e, idx) => {
      const realIdx = extras.indexOf(e);
      const m = e.macros || {};
      const macroLine = [
        m.kcal != null ? `<strong>${m.kcal}</strong> kcal` : '',
        m.p    != null ? `<strong>${m.p}</strong> B` : '',
        m.c    != null ? `<strong>${m.c}</strong> S` : '',
        m.f    != null ? `<strong>${m.f}</strong> T` : '',
      ].filter(Boolean).join(' · ');
      html += `<div class="extra-meal-card">
        <span class="meal-person">${escapeHtml(plan.persons[e.pk]?.name || e.pk)}</span>
        <div class="meal-name">${escapeHtml(e.name)}</div>
        <div class="meal-macros">${macroLine}</div>
        <button class="extra-del-btn" data-extra-idx="${realIdx}">✕ Odebrat</button>
      </div>`;
    });
    html += '</div>';
  }

  html += `<button class="extra-add-btn" id="extra-open-btn">＋ Doplnit jídlo</button>`;

  // Discarded meals
  const discarded = day.discarded_meals || [];
  const visibleDiscarded = discarded.filter(d => pf === 'both' || d.pk === pf);
  if (visibleDiscarded.length > 0) {
    html += `<div class="discarded-section"><div class="discarded-label">Odložená jídla</div>`;
    visibleDiscarded.forEach(d => {
      const realIdx = discarded.indexOf(d);
      const m = d.macros || {};
      const macroLine = [
        m.kcal != null ? `<strong>${m.kcal}</strong> kcal` : '',
        m.p    != null ? `<strong>${m.p}</strong> B` : '',
        m.c    != null ? `<strong>${m.c}</strong> S` : '',
        m.f    != null ? `<strong>${m.f}</strong> T` : '',
      ].filter(Boolean).join(' · ');
      html += `<div class="discarded-card">
        <span class="meal-person">${escapeHtml(plan.persons[d.pk]?.name || d.pk)}</span>
        <div class="meal-name">${escapeHtml(d.name)}</div>
        <div class="meal-macros">${macroLine}</div>
        <button class="discard-restore-btn" data-discard-idx="${realIdx}">↩ Obnovit</button>
      </div>`;
    });
    html += '</div>';
  }

  html += dayTotalsHTML(plan, day, persons);
  main.innerHTML = html;

  // Person filter buttons
  main.querySelectorAll('.pf-btn').forEach(btn => {
    btn.addEventListener('click', () => { STATE.personFilter = btn.dataset.pf; rerender(); });
  });

  // Accordion toggle (click slot row but not add button)
  main.querySelectorAll('.slot-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.slot-row-add')) return;
      const key  = row.dataset.slot;
      const body = main.querySelector(`[data-slot-body="${key}"]`);
      if (_expanded.has(key)) {
        _expanded.delete(key); row.classList.remove('expanded'); body.classList.add('hidden');
      } else {
        _expanded.add(key); row.classList.add('expanded'); body.classList.remove('hidden');
      }
    });
  });

  // Meal actions
  main.querySelectorAll('[data-act="eat"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (STATE.ate[key]) delete STATE.ate[key]; else STATE.ate[key] = true;
      persistAte(); rerender();
    });
  });
  main.querySelectorAll('[data-act="photo"]').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.photoTarget = { planId, dayIdx, slot: btn.dataset.slot, personKey: btn.dataset.person, mode: 'replace' };
      openPhotoSource();
    });
  });
  main.querySelectorAll('[data-act="chat"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.slot; const pk = btn.dataset.person;
      const slotData = day.meals[slot] || {};
      const meal = slotData.shared
        ? { name: slotData.shared.name, macros: slotData.shared['macros_'+pk] }
        : slotData[pk];
      if (meal) openChat({ planId, dayIdx, slot, personKey: pk, meal });
    });
  });
  main.querySelectorAll('[data-act="replace"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openReplace({ planId, dayIdx, slot: btn.dataset.slot, pk: btn.dataset.person });
    });
  });
  main.querySelectorAll('[data-act="editmacro"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.slot; const pk = btn.dataset.person;
      const slotData = day.meals[slot] || {};
      const meal = slotData.shared
        ? { name: slotData.shared.name, macros: slotData.shared['macros_'+pk] || {} }
        : slotData[pk];
      if (meal) openEditMacro({ planId, dayIdx, slot, pk, meal, rerender });
    });
  });
  main.querySelectorAll('.extra-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.extraIdx, 10);
      if (!isNaN(idx)) {
        day.extra_meals.splice(idx, 1);
        persistPlans(); rerender();
      }
    });
  });
  const extraOpenBtn = document.getElementById('extra-open-btn');
  if (extraOpenBtn) {
    extraOpenBtn.addEventListener('click', () => openExtraMeal({ plan, planId, dayIdx, rerender }));
  }

  main.querySelectorAll('[data-act="move"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openMoveModal(plan, day, dayIdx, planId, btn.dataset.slot, btn.dataset.person, rerender);
    });
  });

  main.querySelectorAll('[data-act="reset"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!plan._original_days) {
        alert('Původní verze není k dispozici — smaž plán a importuj znovu.');
        return;
      }
      const slot    = btn.dataset.slot;
      const origDay = plan._original_days[dayIdx];
      const origSlot = origDay?.meals?.[slot];
      if (!origSlot) return;
      plan.days[dayIdx].meals[slot] = JSON.parse(JSON.stringify(origSlot));
      persistPlans();
      rerender();
    });
  });

  main.querySelectorAll('[data-act="discard"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slotKey  = btn.dataset.slot;
      const pk       = btn.dataset.person;
      const slotData = day.meals[slotKey] || {};
      const meal = slotData.shared
        ? { name: slotData.shared.name, note: slotData.shared.note,
            macros: slotData.shared['macros_'+pk] || {}, type: slotData.shared.type }
        : slotData[pk];
      if (!meal) return;
      if (!day.discarded_meals) day.discarded_meals = [];
      day.discarded_meals.push({ pk, slot: slotKey, ...meal });
      if (slotData.shared) breakShared(day, slotKey);
      delete day.meals[slotKey][pk];
      persistPlans();
      rerender();
    });
  });

  main.querySelectorAll('.discard-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.discardIdx, 10);
      if (isNaN(idx)) return;
      const d = day.discarded_meals[idx];
      if (!d) return;
      const { pk, slot, ...mealData } = d;
      if (!day.meals[slot]) day.meals[slot] = {};
      const slotData = day.meals[slot];
      if (slotData.shared) breakShared(day, slot);
      if (!slotData[pk]) {
        slotData[pk] = mealData;
      } else {
        if (!day.extra_meals) day.extra_meals = [];
        day.extra_meals.push({ pk, name: mealData.name, note: mealData.note, macros: mealData.macros });
      }
      day.discarded_meals.splice(idx, 1);
      persistPlans();
      rerender();
    });
  });

  // Swipe gesture — navigates across full timeline (all plans)
  let sx = null, sy = null;
  main.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) {
      const tl = buildTimeline(STATE.plans);
      const ci = tl.findIndex(t => t.planId === planId && t.dayIdx === dayIdx);
      if (dx > 0 && ci > 0) {
        const p = tl[ci - 1]; STATE.currentPlanId = p.planId; STATE.currentDayIdx = p.dayIdx;
        persistCurrent(); rerender(); window.scrollTo(0, 0);
      } else if (dx < 0 && ci < tl.length - 1) {
        const n = tl[ci + 1]; STATE.currentPlanId = n.planId; STATE.currentDayIdx = n.dayIdx;
        persistCurrent(); rerender(); window.scrollTo(0, 0);
      }
    }
    sx = null;
  }, { passive: true });
}
