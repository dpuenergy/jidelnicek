import { STATE } from '../state.js';
import { escapeHtml, computeDayTotals, activeMetricsFor } from '../helpers.js';

export function renderWeekView() {
  const main = document.getElementById('main');
  const plan = STATE.currentPlanId ? STATE.plans[STATE.currentPlanId] : null;

  if (!plan) {
    main.innerHTML = `<div class="empty-state"><h2>Žádný plán</h2><p>Nejdřív importuj jídelníček.</p></div>`;
    return;
  }

  const pf      = STATE.personFilter;
  const persons = pf === 'both' ? ['jakub','partnerka'] : [pf];
  const metrics = activeMetricsFor(plan);

  let html = `<div class="week-summary">`;

  plan.days.forEach((day, idx) => {
    const totals = computeDayTotals(plan, day);
    html += `<div class="week-day-card">
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
    html += '</div>';
  });

  html += '</div>';
  main.innerHTML = html;
}
