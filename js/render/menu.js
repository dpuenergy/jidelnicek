import { STATE, persistPlans, persistCurrent } from '../state.js';
import { escapeHtml, czechDayPlural, planProgress, ICONS, buildTimeline } from '../helpers.js';

export function renderMenuView(rerender, openSettings, openAddPlan) {
  const main = document.getElementById('main');
  const ids  = Object.keys(STATE.plans);

  let html = '';

  // ── Plans list ─────────────────────────────────────────────
  if (ids.length > 0) {
    html += `<div class="menu-section">
      <div class="menu-section-title">Plány · přidržením smažeš</div>`;
    for (const id of ids) {
      const p    = STATE.plans[id];
      const prog = planProgress(id, STATE.plans, STATE.ate);
      const pct  = prog.total > 0 ? Math.round(100 * prog.eaten / prog.total) : 0;
      html += `<div class="menu-item" data-plan-id="${escapeHtml(id)}">
        <span class="menu-item-icon">${ICONS.calendar}</span>
        <div class="menu-item-body">
          <div class="menu-item-label">${escapeHtml(p.plan_title || 'Jídelníček')}</div>
          <div class="menu-item-meta">${escapeHtml(p.date_range || '')} · ${p.days.length} ${czechDayPlural(p.days.length)}</div>
          <div class="menu-item-meta">${prog.eaten}/${prog.total} snědeno · ${pct}% plnění</div>
        </div>
        ${p._original_days ? `<button class="menu-item-reset" data-reset-id="${escapeHtml(id)}" title="Reset plánu">${ICONS.reset}</button>` : ''}
        <span class="menu-item-chevron">›</span>
      </div>`;
    }
    html += '</div>';
  }

  // ── Actions ────────────────────────────────────────────────
  html += `<div class="menu-section">
    <div class="menu-section-title">Akce</div>
    <div class="menu-item" id="menu-add-plan">
      <span class="menu-item-icon">${ICONS.plus}</span>
      <span class="menu-item-label">Přidat plán</span>
      <span class="menu-item-chevron">›</span>
    </div>
    <div class="menu-item" id="menu-settings">
      <span class="menu-item-icon">${ICONS.settings}</span>
      <span class="menu-item-label">Nastavení</span>
      <div class="menu-item-meta">API klíč, model</div>
      <span class="menu-item-chevron">›</span>
    </div>
  </div>`;

  main.innerHTML = html;

  // Tap plan → go to its first day in timeline
  main.querySelectorAll('[data-plan-id]').forEach(item => {
    item.addEventListener('click', () => {
      const pid = item.dataset.planId;
      const tl  = buildTimeline(STATE.plans);
      const entry = tl.find(e => e.planId === pid) || { planId: pid, dayIdx: 0 };
      STATE.currentPlanId = entry.planId;
      STATE.currentDayIdx = entry.dayIdx;
      STATE.view = 'day';
      persistCurrent();
      rerender();
    });
    // Long press → delete
    let timer;
    item.addEventListener('pointerdown', () => {
      timer = setTimeout(() => {
        if (confirm('Smazat tento plán?')) {
          const pid = item.dataset.planId;
          delete STATE.plans[pid];
          if (STATE.currentPlanId === pid) {
            const tl = buildTimeline(STATE.plans);
            STATE.currentPlanId = tl[0]?.planId || null;
            STATE.currentDayIdx = tl[0]?.dayIdx  ?? 0;
          }
          persistPlans(); persistCurrent(); rerender();
        }
      }, 800);
    });
    item.addEventListener('pointerup',    () => clearTimeout(timer));
    item.addEventListener('pointerleave', () => clearTimeout(timer));
  });

  main.querySelectorAll('[data-reset-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid = btn.dataset.resetId;
      const p   = STATE.plans[pid];
      if (!p?._original_days) return;
      if (confirm('Resetovat celý plán na původní verzi z BEN? Vlastní úpravy jídel se ztratí.')) {
        p.days = JSON.parse(JSON.stringify(p._original_days));
        persistPlans(); persistCurrent(); rerender();
      }
    });
  });

  document.getElementById('menu-add-plan').addEventListener('click', openAddPlan);
  document.getElementById('menu-settings').addEventListener('click', openSettings);
}
