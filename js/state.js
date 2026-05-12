export const KEY_PLANS   = 'app_plans_v1';
export const KEY_CURRENT = 'app_current_plan_v1';
export const KEY_DAY     = 'app_current_day_v1';
export const KEY_ATE     = 'app_ate_meals_v1';
export const KEY_CHAT    = 'app_chats_v1';
export const KEY_API     = 'claude_api_key';
export const KEY_MODEL   = 'claude_model';
export const DEFAULT_MODEL = 'claude-sonnet-4-5';

export const STATE = {
  plans: {},
  currentPlanId: null,
  currentDayIdx: 0,
  view: 'day',           // 'day' | 'week' | 'recipes' | 'menu'
  personFilter: 'both',  // 'both' | 'jakub' | 'partnerka'
  ate: {},
  chats: {},
  photoTarget: null,
  chatTarget: null,
  lastPhotoResult: null,
};

export function loadState() {
  try { STATE.plans = JSON.parse(localStorage.getItem(KEY_PLANS) || '{}'); } catch(_) {}
  STATE.currentPlanId = localStorage.getItem(KEY_CURRENT);
  const dayIdx = parseInt(localStorage.getItem(KEY_DAY) || '0', 10);
  STATE.currentDayIdx = isNaN(dayIdx) ? 0 : dayIdx;
  try { STATE.ate = JSON.parse(localStorage.getItem(KEY_ATE) || '{}'); } catch(_) {}
  try { STATE.chats = JSON.parse(localStorage.getItem(KEY_CHAT) || '{}'); } catch(_) {}
  if (STATE.currentPlanId && STATE.plans[STATE.currentPlanId]) {
    const plan = STATE.plans[STATE.currentPlanId];
    if (STATE.currentDayIdx >= plan.days.length) STATE.currentDayIdx = 0;
  } else {
    STATE.currentPlanId = null;
  }
}

export function persistPlans()  { localStorage.setItem(KEY_PLANS, JSON.stringify(STATE.plans)); }
export function persistCurrent() {
  if (STATE.currentPlanId) localStorage.setItem(KEY_CURRENT, STATE.currentPlanId);
  else localStorage.removeItem(KEY_CURRENT);
  localStorage.setItem(KEY_DAY, String(STATE.currentDayIdx));
}
export function persistAte()   { localStorage.setItem(KEY_ATE,   JSON.stringify(STATE.ate)); }
export function persistChats() { localStorage.setItem(KEY_CHAT,  JSON.stringify(STATE.chats)); }
export function getApiKey()    { return localStorage.getItem(KEY_API)   || ''; }
export function getModel()     { return localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL; }
