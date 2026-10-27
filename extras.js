// Sharing the shopping list as text, and a large-print step-by-step cooking view.
'use strict';

// ---------- Share shopping list ----------
function shoppingListText() {
  if (!window.lastShoppingRows) renderShopping();
  const rows = window.lastShoppingRows || [], groups = {};
  for (const x of rows) {
    const key = x.name.toLowerCase();
    if (state.checks[key] || x.qty <= 1e-8) continue;            // bought already, or covered by the pantry
    const p = x.pkg, issues = x.issues || [];
    const safe = p && issues.every(t => !t.startsWith('Cannot') && !t.startsWith('Conversion needed') && !t.startsWith('Check recipe'));
    const packs = safe ? Math.ceil(x.qty / p.qty - 1e-9) : null;
    const amount = packs !== null ? `${packs} ${p.label}${packs === 1 ? '' : 's'} (${fmt(p.qty)} ${p.unit} each)` : `${fmt(x.qty)} ${x.unit}`.trim();
    (groups[departmentFor(x.name)] ??= []).push(`• ${x.name} — ${amount}`);
  }
  const order = [...DEPARTMENTS, ...Object.keys(groups).filter(g => !DEPARTMENTS.includes(g))];
  const sections = order.filter(g => groups[g]?.length).map(g => g.toUpperCase() + '\n' + groups[g].join('\n'));
  if (!sections.length) return '';
  const date = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `Shopping list (${date})\n\n${sections.join('\n\n')}`;
}
async function shareShoppingList() {
  const text = shoppingListText();
  if (!text) return toast('Nothing left to buy');
  try { if (navigator.share) return await navigator.share({ title: 'Shopping list', text }) } catch (e) { if (e.name === 'AbortError') return }
  try { await navigator.clipboard.writeText(text); toast('Shopping list copied') }
  catch (_) { openModal(`<div class="row between"><h2>Shopping list</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div><textarea rows="16" style="width:100%" readonly>${esc(text)}</textarea>`) }
}

// ---------- Cook mode ----------
let cookView = null, wakeLock = null;
function recipeSteps(r) { return (r.directions || []).flatMap(d => String(d).split(/\n+/)).map(d => d.trim()).filter(Boolean) }
function openCookMode(name) {
  const r = state.data.recipes[name];
  if (!r) return;
  const servings = num(document.getElementById('detailServings')?.value) || r.baseServings;
  cookView = { name, step: 0, steps: recipeSteps(r), scale: servings / r.baseServings, servings, showIngredients: !recipeSteps(r).length };
  closeModal();
  let el = document.getElementById('cookMode');
  if (!el) { el = document.createElement('div'); el.id = 'cookMode'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el) }
  el.hidden = false;
  document.body.classList.add('cooking');
  keepScreenOn();
  renderCookMode();
}
function renderCookMode() {
  const el = document.getElementById('cookMode'), c = cookView;
  if (!el || !c) return;
  const r = state.data.recipes[c.name], total = c.steps.length;
  const ingredients = r.ingredients.map(i => `<li><span>${esc(i.name)}</span><b>${displayQty(i, c.scale)} ${esc(i.unit || '')}</b></li>`).join('');
  el.setAttribute('aria-label', 'Cooking ' + c.name);
  el.innerHTML = `<div class="cook-top"><div><div class="cook-title">${esc(c.name)}</div><div class="cook-sub">${fmt(c.servings)} servings${wakeLock ? ' · screen stays on' : ''}</div></div><button class="cook-close" aria-label="Close cook mode" onclick="closeCookMode()">✕</button></div>
    <div class="cook-tabs"><button class="${c.showIngredients ? '' : 'on'}" onclick="cookView.showIngredients=false;renderCookMode()" ${total ? '' : 'disabled'}>Steps</button><button class="${c.showIngredients ? 'on' : ''}" onclick="cookView.showIngredients=true;renderCookMode()">Ingredients</button></div>
    ${c.showIngredients ? `<ul class="cook-ingredients">${ingredients}</ul>${total ? '' : '<p class="cook-sub">This recipe has no written steps yet. Add them with Edit recipe.</p>'}`
      : `<div class="cook-count">Step ${c.step + 1} of ${total}</div><div class="cook-step" aria-live="polite">${esc(c.steps[c.step])}</div>`}
    ${c.showIngredients ? '' : `<div class="cook-nav"><button onclick="cookMove(-1)" ${c.step === 0 ? 'disabled' : ''}>‹ Back</button><button class="next" onclick="${c.step === total - 1 ? 'closeCookMode()' : 'cookMove(1)'}">${c.step === total - 1 ? 'Done ✓' : 'Next ›'}</button></div>`}`;
}
function cookMove(d) { cookView.step = Math.min(cookView.steps.length - 1, Math.max(0, cookView.step + d)); renderCookMode() }
function closeCookMode() {
  const el = document.getElementById('cookMode');
  if (el) el.hidden = true;
  document.body.classList.remove('cooking');
  const name = cookView?.name; cookView = null;
  try { wakeLock?.release() } catch (_) {}
  wakeLock = null;
  if (name && state.data.recipes[name]) openRecipe(name);
}
async function keepScreenOn() {
  try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null }); renderCookMode() } }
  catch (e) { console.info('Screen may turn off while cooking:', e.message) }
}
document.addEventListener('visibilitychange', () => { if (cookView && document.visibilityState === 'visible' && !wakeLock) keepScreenOn() });
document.addEventListener('keydown', e => {
  if (!cookView) return;
  if (e.key === 'ArrowRight') cookMove(1); else if (e.key === 'ArrowLeft') cookMove(-1); else if (e.key === 'Escape') closeCookMode();
});

// ---------- Settings screen extras ----------
function renderSettingsExtras() {
  if (typeof renderFamilyCard === 'function') renderFamilyCard();
  if (typeof renderBackupList === 'function') renderBackupList();
}
