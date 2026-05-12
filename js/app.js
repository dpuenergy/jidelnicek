import { loadState, STATE, persistCurrent } from './state.js';
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

function boot() {
  loadState();

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

boot();
