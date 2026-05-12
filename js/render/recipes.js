export function renderRecipesView() {
  document.getElementById('main').innerHTML = `
    <input class="recipes-search" placeholder="Hledat recept…" disabled>
    <div class="empty-state">
      <h2>Žádné recepty</h2>
      <p>BEN je naimportuje při generování jídelníčku.<br>
         Připraveno — zatím prázdné.</p>
    </div>`;
}
