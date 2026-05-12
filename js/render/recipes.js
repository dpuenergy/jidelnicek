import { STATE } from '../state.js';
import { escapeHtml } from '../helpers.js';

function getAllRecipes() {
  const map = new Map();
  for (const plan of Object.values(STATE.plans)) {
    for (const r of (plan.recipes || [])) {
      if (!map.has(r.id)) map.set(r.id, { ...r, _planTitle: plan.plan_title });
    }
  }
  return [...map.values()];
}

const PROTEIN_LABEL = { 'Kuřecí':'🍗', 'Hovězí':'🥩', 'Vepřové':'🐷', 'Zvěřina':'🦌', 'Ryby':'🐟', 'Vegetariánské':'🥦', 'Smíšené':'🍲' };

function getMacros(r) {
  if (r.macros_per_100g)   return { m: r.macros_per_100g,   unit: '/100g' };
  if (r.macros_per_serving) return { m: r.macros_per_serving, unit: '/porci' };
  return null;
}

function macroDonut(macros, unit) {
  const p = macros.p || 0, c = macros.c || 0, f = macros.f || 0;
  const pKcal = p * 4, cKcal = c * 4, fKcal = f * 9;
  const total  = pKcal + cKcal + fKcal || 1;
  const pPct   = (pKcal / total) * 100;
  const cPct   = (cKcal / total) * 100;
  const grad   = `conic-gradient(var(--c-protein) 0% ${pPct.toFixed(1)}%, var(--c-carbs) ${pPct.toFixed(1)}% ${(pPct + cPct).toFixed(1)}%, var(--c-fat) ${(pPct + cPct).toFixed(1)}% 100%)`;
  return `<div class="macro-donut-wrap">
    <div class="macro-donut" style="background:${grad}">
      <div class="macro-donut-inner"><span class="mdi-kcal">${macros.kcal}</span><span class="mdi-label">kcal</span></div>
    </div>
    <div class="macro-donut-legend">
      <span class="mdl-p">B ${p}g</span>
      <span class="mdl-c">S ${c}g</span>
      <span class="mdl-f">T ${f}g</span>
      <span class="mdl-unit">${unit}</span>
    </div>
  </div>`;
}

function recipeCardHTML(r) {
  const vBadge = r.v_compatible === false
    ? `<span class="recipe-badge v-no" title="${escapeHtml(r.v_restriction || '')}">V ✗</span>`
    : r.v_compatible === true ? `<span class="recipe-badge v-yes">V ✓</span>` : '';
  const ptLabel    = PROTEIN_LABEL[r.protein_type] || '';
  const catBadge   = r.category && r.category !== 'hlavní jídlo'
    ? `<span class="recipe-cat-badge">${escapeHtml(r.category)}</span>` : '';
  const personBadge = r.person
    ? `<span class="recipe-person-badge">${escapeHtml(r.person)}</span>` : '';
  const macroData  = getMacros(r);

  return `<div class="recipe-card" data-rid="${escapeHtml(r.id)}">
    <div class="recipe-card-header">
      ${catBadge || (ptLabel ? `<span class="recipe-pt">${ptLabel} ${escapeHtml(r.protein_type || '')}</span>` : '')}
      ${personBadge}
      ${vBadge}
    </div>
    <div class="recipe-card-body">
      <div class="recipe-card-text">
        <div class="recipe-card-name">${escapeHtml(r.name)}</div>
        ${r.batch_note ? `<div class="recipe-card-batch">${escapeHtml(r.batch_note)}</div>` : ''}
      </div>
      ${macroData ? macroDonut(macroData.m, macroData.unit) : ''}
    </div>
  </div>`;
}

function renderList(all, query, listEl) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? all.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.batch_note || '').toLowerCase().includes(q) ||
        (r.category  || '').toLowerCase().includes(q) ||
        (r.person    || '').toLowerCase().includes(q)
      )
    : all;

  if (filtered.length === 0) {
    listEl.innerHTML = `<p style="text-align:center;color:var(--ink-faint);padding:32px 0;font-size:14px">Žádný recept neodpovídá hledání.</p>`;
    return;
  }
  listEl.innerHTML = filtered.map(recipeCardHTML).join('');
  listEl.querySelectorAll('.recipe-card').forEach(card => {
    card.addEventListener('click', () => openRecipeModal(card.dataset.rid, all));
  });
}

function openRecipeModal(id, all) {
  const r = all.find(x => x.id === id);
  if (!r) return;

  document.getElementById('recipe-modal-name').textContent = r.name;

  const times = [
    r.prep_time ? `Příp.: ${r.prep_time} min` : '',
    r.cook_time ? `Vaření: ${r.cook_time} min` : '',
  ].filter(Boolean).join('  ·  ');
  const metaEl = document.getElementById('recipe-modal-meta');

  const macroData = getMacros(r);
  if (macroData) {
    const { m, unit } = macroData;
    const timePart = times ? `<div style="font-size:12px;color:var(--ink-faint);margin-bottom:6px">${escapeHtml(times)}</div>` : '';
    metaEl.innerHTML = `${timePart}<span class="rm-kcal">${m.kcal} kcal</span> <span class="rm-p">B ${m.p}g</span> <span class="rm-c">S ${m.c}g</span> <span class="rm-f">T ${m.f}g</span> <span class="rm-unit">${unit}</span>`;
    metaEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;margin-bottom:16px';
  } else {
    metaEl.textContent = times;
    metaEl.style.cssText = '';
    metaEl.style.display = times ? 'block' : 'none';
  }

  const sdWrap = document.getElementById('recipe-modal-sides-wrap');
  const sdEl   = document.getElementById('recipe-modal-sides');
  if (sdWrap && r.side_dishes && r.side_dishes.length) {
    sdEl.textContent = r.side_dishes.join(', ');
    sdWrap.style.display = 'block';
  } else if (sdWrap) { sdWrap.style.display = 'none'; }

  document.getElementById('recipe-modal-ingredients').innerHTML = (r.ingredients || [])
    .map(i => `<li><strong>${escapeHtml(i.amount)}</strong> — ${escapeHtml(i.item)}</li>`)
    .join('');

  const stepsEl   = document.getElementById('recipe-modal-steps');
  const stepsWrap = document.getElementById('recipe-steps-wrap');
  if (r.steps && r.steps.length) {
    stepsEl.innerHTML = r.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('');
    stepsWrap.style.display = 'block';
  } else {
    stepsWrap.style.display = 'none';
  }

  const notesEl   = document.getElementById('recipe-modal-notes');
  const notesWrap = document.getElementById('recipe-modal-notes-wrap');
  if (r.notes) {
    notesEl.textContent = r.notes;
    notesWrap.style.display = 'block';
  } else {
    notesWrap.style.display = 'none';
  }

  document.getElementById('recipe-modal').classList.remove('hidden');
}

export function renderRecipesView() {
  const main = document.getElementById('main');
  const all  = getAllRecipes();

  if (all.length === 0) {
    main.innerHTML = `
      <input class="recipes-search" placeholder="Hledat recept…" disabled>
      <div class="empty-state">
        <h2>Žádné recepty</h2>
        <p>BEN je přidá do JSON plánu při generování.<br>Importuj plán, který recepty obsahuje.</p>
      </div>`;
    return;
  }

  main.innerHTML = `
    <input class="recipes-search" id="recipes-search" placeholder="Hledat recept…">
    <div id="recipes-list" class="recipes-list"></div>`;

  const listEl   = document.getElementById('recipes-list');
  const searchEl = document.getElementById('recipes-search');

  renderList(all, '', listEl);
  searchEl.addEventListener('input', e => renderList(all, e.target.value, listEl));
}
