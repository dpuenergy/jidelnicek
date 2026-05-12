export const SLOT_EMOJI = { snidane:'🍳', svacina:'🥪', obed:'🍝', vecere:'🌙' };
export const slotEmoji = k => SLOT_EMOJI[k] || '🍴';

export function czechDayPlural(n) {
  if (n === 1) return 'den';
  if (n >= 2 && n <= 4) return 'dny';
  return 'dní';
}

export function mealKey(planId, dayIdx, slot, personKey) {
  return `${planId}:${dayIdx}:${slot}:${personKey}`;
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
