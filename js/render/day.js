import { STATE, persistAte, persistCurrent } from '../state.js';
import {
  escapeHtml, activeMetricsFor, computeDayTotals,
  computeEatenTotals, mealKey, slotIcon,
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
  const ratio = total > 0 ? Math.min(eaten / total, 1) : 0;
  const dash  = (ratio * C).toFixed(1);
  const gap   = (C - parseFloat(dash)).toFixed(1);
  const pct   = Math.round(ratio * 100);
  const stroke = eaten > total * 1.05 ? 'var(--c-over)' : 'var(--accent)';
  const sw = sizeClass === 'small' ? 6 : 8;

  return `<div class="hero-circle${sizeClass ? ' ' + sizeClass : ''}">
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
      <span class="hero-pct">${pct}%</span>
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
    const tgt = plan.persons[pk].targets.kcal || 0;
    circlesHTML = `<div class="hero-circle-item">
      <span class="hero-person-name">${escapeHtml(plan.persons[pk].name)}</span>
      ${heroCircleHTML(eaten[pk].kcal, tgt)}
    </div>`;
  } else {
    circlesHTML = persons.map(pk => {
      const tgt = plan.persons[pk].targets.kcal || 0;
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
      <button data-act="photo" data-slot="${slotKey}" data-person="${pk}">📷 Foto</button>
      <button data-act="chat"  data-slot="${slotKey}" data-person="${pk}">💬 Otázka</button>
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
    const tgt = plan.persons[pk].targets;
    html += `<div class="day-totals-person">
      <div class="day-totals-name">${escapeHtml(plan.persons[pk].name)}</div>`;
    for (const m of metrics) {
      const v    = Math.round(t[m.key] || 0);
      const tg   = tgt[m.key] || 0;
      const pct  = tg ? Math.min(v / tg, 1.25) * 80 : 0;
      const over = tg && v > tg * 1.05;
      html += `<div class="metric-row">
        <span class="metric-label">${escapeHtml(m.label)}</span>
        <span class="metric-bar"><span class="metric-fill ${m.key}${over ? ' over' : ''}" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="metric-value${over ? ' over' : ''}">${v}${tg ? ' / '+tg : ''}${m.key === 'kcal' ? '' : ' g'}</span>
      </div>`;
    }
    html += '</div>';
  }
  return html + '</div>';
}

// ── Main render ────────────────────────────────────────────────
export function renderDayView(rerender, openPhotoSource, openChat) {
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
      <button class="slot-row-add" data-slot-add="${slotKey}" title="Přidat">＋</button>
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

  // Swipe gesture
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
      if (dx > 0 && STATE.currentDayIdx > 0) {
        STATE.currentDayIdx--; persistCurrent(); rerender(); window.scrollTo(0, 0);
      } else if (dx < 0 && plan && STATE.currentDayIdx < plan.days.length - 1) {
        STATE.currentDayIdx++; persistCurrent(); rerender(); window.scrollTo(0, 0);
      }
    }
    sx = null;
  }, { passive: true });
}
