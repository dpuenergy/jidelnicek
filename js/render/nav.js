import { STATE, persistCurrent } from '../state.js';
import { escapeHtml, buildTimeline } from '../helpers.js';

const MONTH = ['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro'];

export function renderBottomNav() {
  document.querySelectorAll('.bnav-btn[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === STATE.view);
  });
}

export function renderWeekStrip(rerender) {
  const wrap     = document.getElementById('week-strip-wrap');
  const timeline = buildTimeline(STATE.plans);

  if (timeline.length === 0 || STATE.view !== 'day') { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  const strip = document.getElementById('week-strip');
  let lastMonth = -1;
  strip.innerHTML = timeline.map((entry, idx) => {
    const { day, planId, dayIdx } = entry;
    const active   = planId === STATE.currentPlanId && dayIdx === STATE.currentDayIdx;
    const name     = day.name ? day.name.slice(0, 2) : `D${dayIdx + 1}`;
    const dateNum  = day.date ? day.date.replace(/\s*\..*/, '').trim() : String(dayIdx + 1);
    const mo       = entry.date ? entry.date.getMonth() : -1;
    const newMonth = mo !== -1 && mo !== lastMonth;
    if (newMonth) lastMonth = mo;
    return `${newMonth ? `<span class="week-strip-month">${MONTH[mo]}</span>` : ''}
      <button class="week-day${active ? ' active' : ''}" data-tidx="${idx}">
        <span class="wd-name">${escapeHtml(name)}</span>
        <span class="wd-date">${escapeHtml(dateNum)}</span>
      </button>`;
  }).join('');

  strip.querySelectorAll('.week-day').forEach(btn => {
    btn.addEventListener('click', () => {
      const e = timeline[parseInt(btn.dataset.tidx)];
      STATE.currentPlanId = e.planId;
      STATE.currentDayIdx = e.dayIdx;
      persistCurrent();
      rerender();
      window.scrollTo(0, 0);
    });
  });

  const active = strip.querySelector('.week-day.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
}
