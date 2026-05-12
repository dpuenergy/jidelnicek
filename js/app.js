import { loadState, STATE, persistCurrent } from './state.js';
import { buildTimeline, parseDayDate } from './helpers.js';
import { renderBottomNav, renderWeekStrip } from './render/nav.js';
import { renderDayView }     from './render/day.js';
import { renderWeekView }    from './render/week.js';
import { renderRecipesView } from './render/recipes.js';
import { renderMenuView }    from './render/menu.js';
import {
  initModalDismiss, initSettings, initAddPlan,
  initActionSheet, initPhoto, initChat,
  openPhotoSource, openChat, openAddPlan, openSettings,
} from './modals.js';

export function render() {
  renderBottomNav();
  renderWeekStrip(render);

  switch (STATE.view) {
    case 'day':
      renderDayView(render, openPhotoSource, openChat);
      break;
    case 'week':
      renderWeekView();
      break;
    case 'recipes':
      renderRecipesView();
      break;
    case 'menu':
      renderMenuView(render, openSettings, openAddPlan);
      break;
  }
}

function onPlanImported(planId) {
  STATE.currentPlanId = planId;
  STATE.currentDayIdx = 0;
  STATE.view = 'day';
  persistCurrent();
  render();
}

function autoInitTimeline() {
  const tl = buildTimeline(STATE.plans);
  if (tl.length === 0) return;
  // If current plan/day is already valid, keep it
  if (STATE.currentPlanId && STATE.plans[STATE.currentPlanId]) return;
  // Otherwise jump to the day closest to today
  const now = new Date();
  const best = tl.reduce((acc, e) => {
    if (!e.date) return acc;
    const diff = Math.abs(e.date - now);
    return (!acc || diff < acc.diff) ? { e, diff } : acc;
  }, null);
  const target = best ? best.e : tl[0];
  STATE.currentPlanId = target.planId;
  STATE.currentDayIdx = target.dayIdx;
}

async function applyConfig() {
  try {
    const cfg = await import('./config.js');
    if (cfg.CLAUDE_KEY)   localStorage.setItem('claude_api_key', cfg.CLAUDE_KEY);
    if (cfg.CLAUDE_MODEL) localStorage.setItem('claude_model',   cfg.CLAUDE_MODEL);
  } catch { /* config.js not present — use localStorage settings */ }
}

async function boot() {
  await applyConfig();
  loadState();
  autoInitTimeline();

  initModalDismiss();
  initSettings();
  initAddPlan(onPlanImported);
  initActionSheet(openAddPlan);
  initPhoto(render);
  initChat();

  // Bottom nav tab clicks
  document.querySelectorAll('.bnav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.view = btn.dataset.tab;
      render();
      window.scrollTo(0, 0);
    });
  });

  render();
}

boot().catch(console.error);
