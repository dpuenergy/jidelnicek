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

function recipeCardHTML(r) {
  const times = [
    r.prep_time ? `příp. ${r.prep_time} min` : '',
    r.cook_time ? `vaření ${r.cook_time} min` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="recipe-card" data-rid="${escapeHtml(r.id)}">
    <div class="recipe-card-name">${escapeHtml(r.name)}</div>
    ${r.batch_note ? `<div class="recipe-card-batch">batch · ${escapeHtml(r.batch_note)}</div>` : ''}
    <div class="recipe-card-footer">
      ${times ? `<span class="recipe-card-meta">${times}</span>` : ''}
      ${r.ingredients ? `<span class="recipe-card-count">${r.ingredients.length} ingrediencí</span>` : ''}
    </div>
  </div>`;
}

function renderList(all, query, listEl) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? all.filter(r => r.name.toLowerCase().includes(q) || (r.batch_note || '').toLowerCase().includes(q))
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
  metaEl.textContent = times;
  metaEl.style.display = times ? 'block' : 'none';

  document.getElementById('recipe-modal-ingredients').innerHTML = (r.ingredients || [])
    .map(i => `<li><strong>${escapeHtml(i.amount)}</strong> — ${escapeHtml(i.item)}</li>`)
    .join('');

  const stepsEl  = document.getElementById('recipe-modal-steps');
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
