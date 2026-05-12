import { STATE, persistCurrent } from '../state.js';
import { escapeHtml } from '../helpers.js';

export function renderBottomNav() {
  document.querySelectorAll('.bnav-btn[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === STATE.view);
  });
}

export function renderWeekStrip(rerender) {
  const wrap = document.getElementById('week-strip-wrap');
  const plan = STATE.currentPlanId ? STATE.plans[STATE.currentPlanId] : null;

  if (!plan || STATE.view !== 'day') { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  const strip = document.getElementById('week-strip');
  strip.innerHTML = plan.days.map((day, idx) => {
    const active  = idx === STATE.currentDayIdx;
    const name    = day.name ? day.name.slice(0, 2) : `D${idx + 1}`;
    const dateNum = day.date ? day.date.replace(/\s*\..*/, '').trim() : String(idx + 1);
    return `<button class="week-day${active ? ' active' : ''}" data-idx="${idx}">
      <span class="wd-name">${escapeHtml(name)}</span>
      <span class="wd-date">${escapeHtml(dateNum)}</span>
    </button>`;
  }).join('');

  strip.querySelectorAll('.week-day').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.currentDayIdx = parseInt(btn.dataset.idx);
      persistCurrent();
      rerender();
      window.scrollTo(0, 0);
    });
  });

  const active = strip.querySelector('.week-day.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
}
