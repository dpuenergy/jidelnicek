import { STATE } from '../state.js';
import {
  escapeHtml, computeDayTotals, activeMetricsFor,
  mealKey, buildTimeline,
} from '../helpers.js';

const today = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

function dayAdherence(plan, day, dayIdx, planId) {
  const result = {};
  for (const pk of ['jakub', 'partnerka']) {
    let eaten = 0, total = 0;
    const dots = plan.slots.map(slotKey => {
      const slot = day.meals[slotKey] || {};
      const has  = slot.shared ? true : !!slot[pk];
      if (!has) return null;
      total++;
      if (STATE.ate[mealKey(planId, dayIdx, slotKey, pk)]) { eaten++; return 'eaten'; }
      return 'planned';
    });
    result[pk] = { dots, eaten, total };
  }
  return result;
}

export function renderWeekView() {
  const main     = document.getElementById('main');
  const timeline = buildTimeline(STATE.plans);

  if (timeline.length === 0) {
    main.innerHTML = `<div class="empty-state"><h2>Žádný plán</h2><p>Nejdřív importuj jídelníček.</p></div>`;
    return;
  }

  const pf      = STATE.personFilter;
  const persons = pf === 'both' ? ['jakub', 'partnerka'] : [pf];
  const now     = today();

  // Use metrics from first plan that has targets (they should be consistent)
  const firstPlan = timeline[0].plan;
  const metrics   = activeMetricsFor(firstPlan);

  // ── Overall adherence (past + today only) ─────────────────
  const totAdh = { jakub: { e: 0, t: 0 }, partnerka: { e: 0, t: 0 } };
  timeline.forEach(({ plan, planId, dayIdx, day, date }) => {
    if (date && date > now) return; // future days not counted
    const adh = dayAdherence(plan, day, dayIdx, planId);
    for (const pk of ['jakub', 'partnerka']) {
      totAdh[pk].e += adh[pk].eaten;
      totAdh[pk].t += adh[pk].total;
    }
  });

  const summaryPersons = persons.map(pk => {
    const { e, t } = totAdh[pk];
    const pct = t > 0 ? Math.round(100 * e / t) : 0;
    const plan = STATE.plans[STATE.currentPlanId] || firstPlan;
    return `<span class="was-person">
      <span class="was-name">${escapeHtml(plan.persons[pk].name)}</span>
      <strong>${e}/${t}</strong>
      <span class="was-pct">${pct}%</span>
    </span>`;
  }).join('');

  let html = `
    <div class="week-adherence-summary">
      <div class="was-label">Plnění plánu (do dnes)</div>
      <div class="was-persons">${summaryPersons}</div>
    </div>
    <div class="week-summary">`;

  // ── Day cards ──────────────────────────────────────────────
  let lastPlanId = null;
  timeline.forEach(({ plan, planId, dayIdx, day, date }) => {
    const totals   = computeDayTotals(plan, day);
    const adh      = dayAdherence(plan, day, dayIdx, planId);
    const isPast   = !date || date <= now;
    const planMetrics = activeMetricsFor(plan);

    // Plan separator label when crossing plan boundary
    const planLabel = planId !== lastPlanId
      ? `<div class="week-plan-label">${escapeHtml(plan.plan_title || planId)}</div>`
      : '';
    lastPlanId = planId;

    html += planLabel + `<div class="week-day-card${isPast ? '' : ' future'}">
      <div class="wdc-header">
        <span class="wdc-name">${escapeHtml(day.name || '')}</span>
        <span class="wdc-date">${escapeHtml(day.date || '')}</span>
        ${day.note ? `<span class="wdc-note">${escapeHtml(day.note)}</span>` : ''}
      </div>`;

    for (const pk of persons) {
      const t   = totals[pk];
      const tgt = plan.persons[pk].targets;
      html += `<div class="day-totals-person">
        <div class="day-totals-name">${escapeHtml(plan.persons[pk].name)}</div>`;
      for (const m of planMetrics) {
        const v    = Math.round(t[m.key] || 0);
        const tg   = tgt[m.key] || 0;
        const pct  = tg ? Math.min(v / tg, 1.25) * 80 : 0;
        const over = tg && v > tg * 1.05;
        html += `<div class="metric-row">
          <span class="metric-label">${escapeHtml(m.label)}</span>
          <span class="metric-bar"><span class="metric-fill ${m.key}${over ? ' over' : ''}" style="width:${pct.toFixed(1)}%"></span></span>
          <span class="metric-value${over ? ' over' : ''}">${v}${tg ? ' / ' + tg : ''}${m.key === 'kcal' ? '' : ' g'}</span>
        </div>`;
      }
      html += '</div>';
    }

    // Adherence dots — only for past/today
    if (isPast) {
      html += `<div class="adh-wrap">`;
      for (const pk of persons) {
        const { dots, eaten, total } = adh[pk];
        if (total === 0) continue;
        const dotsHtml = dots.map(d =>
          d === null ? '' : `<span class="adh-dot${d === 'eaten' ? ' eaten' : ''}"></span>`
        ).join('');
        html += `<div class="adh-row">
          <span class="adh-person">${escapeHtml(plan.persons[pk].label || pk[0].toUpperCase())}</span>
          <span class="adh-dots">${dotsHtml}</span>
          <span class="adh-count">${eaten}/${total}</span>
        </div>`;
      }
      html += `</div>`;
    }
    html += '</div>';
  });

  html += '</div>';
  main.innerHTML = html;
}
