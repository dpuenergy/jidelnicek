import { STATE, persistPlans, persistCurrent } from '../state.js';
import { escapeHtml, czechDayPlural, planProgress } from '../helpers.js';

export function renderMenuView(rerender, openSettings, openAddPlan) {
  const main = document.getElementById('main');
  const ids  = Object.keys(STATE.plans);

  let html = '';

  // ── Active plan section ────────────────────────────────────
  if (STATE.currentPlanId && STATE.plans[STATE.currentPlanId]) {
    const p = STATE.plans[STATE.currentPlanId];
    html += `<div class="menu-section">
      <div class="menu-section-title">Aktivní plán</div>
      <div class="menu-item" style="border-color:var(--accent)">
        <span class="menu-item-icon">📅</span>
        <div style="flex:1">
          <div class="menu-item-label menu-item-active">${escapeHtml(p.plan_title || 'Jídelníček')}</div>
          <div class="menu-item-meta">${escapeHtml(p.date_range || '')} · ${p.days.length} ${czechDayPlural(p.days.length)}</div>
        </div>
      </div>
    </div>`;
  }

  // ── All plans ──────────────────────────────────────────────
  if (ids.length > 0) {
    html += `<div class="menu-section">
      <div class="menu-section-title">Všechny plány</div>`;
    for (const id of ids) {
      const p    = STATE.plans[id];
      const prog = planProgress(id, STATE.plans, STATE.ate);
      const pct  = prog.total > 0 ? Math.round(100 * prog.eaten / prog.total) : 0;
      const active = id === STATE.currentPlanId;
      html += `<div class="menu-item" data-plan-id="${escapeHtml(id)}">
        <span class="menu-item-icon">${active ? '✅' : '📋'}</span>
        <div style="flex:1">
          <div class="menu-item-label${active ? ' menu-item-active' : ''}">${escapeHtml(p.plan_title || 'Jídelníček')}</div>
          <div class="menu-item-meta">${escapeHtml(p.date_range || '')} · ${prog.eaten}/${prog.total} snědeno (${pct}%)</div>
        </div>
        <span class="menu-item-chevron">›</span>
      </div>`;
    }
    html += '</div>';
  }

  // ── Actions ────────────────────────────────────────────────
  html += `<div class="menu-section">
    <div class="menu-section-title">Akce</div>
    <div class="menu-item" id="menu-add-plan">
      <span class="menu-item-icon">➕</span>
      <span class="menu-item-label">Přidat plán</span>
      <span class="menu-item-chevron">›</span>
    </div>
    <div class="menu-item" id="menu-settings">
      <span class="menu-item-icon">⚙️</span>
      <span class="menu-item-label">Nastavení</span>
      <div class="menu-item-meta">API klíč, model</div>
      <span class="menu-item-chevron">›</span>
    </div>
  </div>`;

  main.innerHTML = html;

  // Tap plan → activate
  main.querySelectorAll('[data-plan-id]').forEach(item => {
    item.addEventListener('click', () => {
      STATE.currentPlanId  = item.dataset.planId;
      STATE.currentDayIdx  = 0;
      STATE.view = 'day';
      persistCurrent();
      rerender();
    });
    // Long press → delete
    let timer;
    item.addEventListener('pointerdown', () => {
      timer = setTimeout(() => {
        if (confirm('Smazat tento plán?')) {
          delete STATE.plans[item.dataset.planId];
          if (STATE.currentPlanId === item.dataset.planId) STATE.currentPlanId = null;
          persistPlans(); persistCurrent(); rerender();
        }
      }, 800);
    });
    item.addEventListener('pointerup',    () => clearTimeout(timer));
    item.addEventListener('pointerleave', () => clearTimeout(timer));
  });

  document.getElementById('menu-add-plan')
    .addEventListener('click', openAddPlan);
  document.getElementById('menu-settings')
    .addEventListener('click', openSettings);
}
