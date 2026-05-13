const _svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONS = {
  coffee:   _svg('<path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/>'),
  apple:    _svg('<path d="M12 17c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z"/><path d="M12 7c0-2 1-4 3-4"/>'),
  utensils: _svg('<line x1="8" y1="3" x2="8" y2="21"/><path d="M5 3v4a3 3 0 006 0V3"/><line x1="16" y1="3" x2="16" y2="10"/><path d="M19 10H13l1.5 11h3L19 10"/>'),
  moon:     _svg('<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'),
  check:    _svg('<polyline points="20 6 9 17 4 12"/>'),
  list:     _svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  plus:     _svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  settings: _svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>'),
  camera:   _svg('<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>'),
  calendar: _svg('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  chat:     _svg('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
  move:     _svg('<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>'),
  reset:    _svg('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.14"/>'),
};

const SLOT_ICON_MAP = { snidane: ICONS.coffee, svacina: ICONS.apple, obed: ICONS.utensils, vecere: ICONS.moon };
export const slotIcon = k => SLOT_ICON_MAP[k] || ICONS.utensils;

// ── Timeline helpers ───────────────────────────────────────────
export function parseDayDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d+)\.\s*(\d+)\./);
  if (!m) return null;
  const now = new Date();
  const d = parseInt(m[1]), mo = parseInt(m[2]) - 1;
  let yr = now.getFullYear();
  const cand = new Date(yr, mo, d);
  if (now - cand > 180 * 86400000) yr++; // >6 months in past → next year
  return new Date(yr, mo, d);
}

export function buildTimeline(plans) {
  const entries = [];
  for (const [planId, plan] of Object.entries(plans)) {
    (plan.days || []).forEach((day, dayIdx) => {
      entries.push({ planId, plan, dayIdx, day, date: parseDayDate(day.date) });
    });
  }
  return entries.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date - b.date;
  });
}

export function czechDayPlural(n) {
  if (n === 1) return 'den';
  if (n >= 2 && n <= 4) return 'dny';
  return 'dní';
}

export function mealKey(planId, dayIdx, slot, personKey) {
  return `${planId}:${dayIdx}:${slot}:${personKey}`;
}

export function extraMealKey(planId, dayIdx, id) {
  return `extra:${planId}:${dayIdx}:${id}`;
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function activeMetricsFor(plan) {
  const all = [
    { key:'kcal', label:'kcal',      labelShort:'kcal' },
    { key:'p',    label:'bílkoviny', labelShort:'B' },
    { key:'c',    label:'sacharidy', labelShort:'S' },
    { key:'f',    label:'tuky',      labelShort:'T' },
    { key:'fiber',label:'vláknina',  labelShort:'V' },
  ];
  return all.filter(m => {
    for (const pk of ['jakub','partnerka']) {
      const t = (plan.persons[pk] && plan.persons[pk].targets) || {};
      if (typeof t[m.key] === 'number' && t[m.key] > 0) return true;
    }
    return false;
  });
}

export function computeDayTotals(plan, day) {
  const zero = () => ({ kcal:0, p:0, c:0, f:0, fiber:0 });
  const out = { jakub: zero(), partnerka: zero() };
  for (const slotKey of plan.slots) {
    const slot = day.meals[slotKey] || {};
    if (slot.shared) {
      for (const pk of ['jakub','partnerka']) {
        const m = slot.shared['macros_'+pk] || {};
        for (const k of Object.keys(out[pk])) if (typeof m[k] === 'number') out[pk][k] += m[k];
      }
    } else {
      for (const pk of ['jakub','partnerka']) {
        const meal = slot[pk];
        if (!meal || !meal.macros) continue;
        for (const k of Object.keys(out[pk])) if (typeof meal.macros[k] === 'number') out[pk][k] += meal.macros[k];
      }
    }
  }
  for (const e of (day.extra_meals || [])) {
    if (!e.macros || !out[e.pk]) continue;
    for (const k of Object.keys(out[e.pk])) if (typeof e.macros[k] === 'number') out[e.pk][k] += e.macros[k];
  }
  return out;
}

export function computeEatenTotals(plan, day, dayIdx, planId, ate) {
  const zero = () => ({ kcal:0, p:0, c:0, f:0, fiber:0 });
  const out = { jakub: zero(), partnerka: zero() };
  for (const slotKey of plan.slots) {
    const slot = day.meals[slotKey] || {};
    if (slot.shared) {
      for (const pk of ['jakub','partnerka']) {
        if (!ate[mealKey(planId, dayIdx, slotKey, pk)]) continue;
        const m = slot.shared['macros_'+pk] || {};
        for (const k of Object.keys(out[pk])) if (typeof m[k] === 'number') out[pk][k] += m[k];
      }
    } else {
      for (const pk of ['jakub','partnerka']) {
        if (!ate[mealKey(planId, dayIdx, slotKey, pk)]) continue;
        const meal = slot[pk];
        if (!meal || !meal.macros) continue;
        for (const k of Object.keys(out[pk])) if (typeof meal.macros[k] === 'number') out[pk][k] += meal.macros[k];
      }
    }
  }
  for (const e of (day.extra_meals || [])) {
    if (!e._id || !e.macros || !out[e.pk]) continue;
    if (!ate[extraMealKey(planId, dayIdx, e._id)]) continue;
    for (const k of Object.keys(out[e.pk])) if (typeof e.macros[k] === 'number') out[e.pk][k] += e.macros[k];
  }
  return out;
}

export function planProgress(planId, plans, ate) {
  const plan = plans[planId];
  if (!plan) return { total:0, eaten:0 };
  let total = 0, eaten = 0;
  plan.days.forEach((day, dayIdx) => {
    for (const slotKey of plan.slots) {
      const slot = day.meals[slotKey] || {};
      if (slot.shared) {
        for (const pk of ['jakub','partnerka']) {
          total++;
          if (ate[mealKey(planId, dayIdx, slotKey, pk)]) eaten++;
        }
      } else {
        for (const pk of ['jakub','partnerka']) {
          if (slot[pk]) { total++; if (ate[mealKey(planId, dayIdx, slotKey, pk)]) eaten++; }
        }
      }
    }
  });
  return { total, eaten };
}
