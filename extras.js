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
  el.setAttribute('aria-label', 'Cooking ' + recipeName(c.name));
  el.innerHTML = `<div class="cook-top"><div><div class="cook-title">${esc(recipeName(c.name))}</div><div class="cook-sub">${fmt(c.servings)} servings${wakeLock ? ' · screen stays on' : ''}</div></div><button class="cook-close" aria-label="Close cook mode" onclick="closeCookMode()">✕</button></div>
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
  if (typeof renderPictureCard === 'function') renderPictureCard();
}

// ---------- Swipe between the main screens ----------
// The screen follows your finger; let go past ~30% of the width (or flick) to move to the next screen.
// Vertical scrolling stays native (main has touch-action: pan-y), and the outer 24px are left to
// Android's back gesture.
(() => {
  const ORDER = ['home', 'recipes', 'plan', 'shopping', 'more'];
  const UNDER_MORE = ['ingredients', 'spending', 'pantry', 'online', 'settings'];
  const EDGE = 24, LOCK = 10;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let s = null, suppressClick = false;
  const position = id => ORDER.indexOf(UNDER_MORE.includes(id) ? 'more' : id);
  const ignore = t => t.closest('input, textarea, select, [contenteditable], nav, header, .edit-inline, .shop-expand[open], .trip-row');
  const reset = el => { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; el.style.willChange = '' };

  document.addEventListener('touchstart', e => {
    s = null;
    if (e.touches.length !== 1 || document.getElementById('modal')?.classList.contains('show') || document.body.classList.contains('cooking')) return;
    const t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > innerWidth - EDGE || ignore(e.target)) return;
    const screen = document.querySelector('.screen.active');
    if (!screen || position(screen.id) < 0) return;
    s = { x: t.clientX, y: t.clientY, time: performance.now(), screen, mode: null, dx: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!s) return;
    const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.mode) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      s.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
      if (s.mode === 'v') { s = null; return }
      s.screen.style.transition = 'none'; s.screen.style.willChange = 'transform, opacity';
    }
    const idx = position(s.screen.id), pastEnd = (dx > 0 && idx === 0) || (dx < 0 && idx === ORDER.length - 1);
    s.dx = pastEnd ? dx * 0.25 : dx;
    s.screen.style.transform = `translateX(${s.dx}px)`;
    s.screen.style.opacity = String(1 - Math.min(Math.abs(s.dx) / innerWidth, 1) * 0.4);
  }, { passive: true });

  function release() {
    if (!s || s.mode !== 'h') { s = null; return }
    const { screen, dx } = s, speed = dx / Math.max(1, performance.now() - s.time);
    s = null;
    suppressClick = true; setTimeout(() => { suppressClick = false }, 350);
    const dir = dx < 0 ? 1 : -1, next = position(screen.id) + dir;
    const go = next >= 0 && next < ORDER.length && (Math.abs(dx) > innerWidth * 0.28 || (Math.abs(speed) > 0.45 && Math.abs(dx) > 40));
    if (!go) {
      screen.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s';
      screen.style.transform = 'translateX(0)'; screen.style.opacity = '1';
      setTimeout(() => reset(screen), 220);
      return;
    }
    if (reduceMotion.matches) { reset(screen); showScreen(ORDER[next]); return }
    screen.style.transition = 'transform .14s ease-in, opacity .14s ease-in';
    screen.style.transform = `translateX(${-dir * innerWidth * 0.6}px)`; screen.style.opacity = '0';
    setTimeout(() => {
      reset(screen);
      showScreen(ORDER[next]);
      const incoming = document.querySelector('.screen.active');
      if (!incoming) return;
      incoming.style.transition = 'none';
      incoming.style.transform = `translateX(${dir * 28}%)`; incoming.style.opacity = '0.3';
      incoming.getBoundingClientRect();   // start from the offset position
      incoming.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1), opacity .2s';
      incoming.style.transform = 'translateX(0)'; incoming.style.opacity = '1';
      setTimeout(() => reset(incoming), 260);
    }, 140);
  }
  document.addEventListener('touchend', release, { passive: true });
  document.addEventListener('touchcancel', release, { passive: true });
  // A sideways drag that started on a button shouldn't also press it.
  document.addEventListener('click', e => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false } }, true);
})();

// ---------- Android back button ----------
// Back closes whatever is on top (picture picker, conversion question, cook mode, a dialog), then
// returns to the previous screen. Only from Home with nothing open does it leave the app.
const screenStack = [];
let navigatingBack = false;
function noteScreen(id) {
  if (navigatingBack || !id) return;
  if (screenStack[screenStack.length - 1] !== id) { screenStack.push(id); if (screenStack.length > 40) screenStack.shift() }
}
function closeTopLayer() {
  const photo = document.getElementById('ingredientPhotoPanel');
  if (photo && photo.style.display === 'flex') { if (typeof pictureFlow !== 'undefined' && pictureFlow) stopIngredientPictures(); else closeIngredientPhoto(); return true }
  const conv = document.getElementById('convPrompt');
  if (conv && !conv.hidden) { closeConversionPrompt(); return true }
  if (document.body.classList.contains('cooking')) { closeCookMode(); return true }
  const toastBar = document.getElementById('actionToast');
  if (document.getElementById('modal')?.classList.contains('show')) { closeModal(); return true }
  if (toastBar) { toastBar.remove(); return true }
  return false;
}
function goBack() {
  if (closeTopLayer()) return true;
  const current = document.querySelector('.screen.active')?.id;
  if (screenStack[screenStack.length - 1] === current) screenStack.pop();
  const previous = screenStack[screenStack.length - 1] || (current !== 'home' ? 'home' : null);
  if (!previous) return false;
  navigatingBack = true;
  try { showScreen(previous) } finally { navigatingBack = false }
  if (!screenStack.length) screenStack.push(previous);
  return true;
}
(() => {
  noteScreen(document.querySelector('.screen.active')?.id || 'home');
  try { history.replaceState({ gingham: 'start' }, ''); history.pushState({ gingham: 'app' }, '') } catch (_) {}
  window.addEventListener('popstate', () => {
    if (goBack()) { try { history.pushState({ gingham: 'app' }, '') } catch (_) {} }
    else history.back();   // nothing left to go back to: let Android close the app
  });
})();

// ---------- After editing an ingredient, bring it back into view ----------
function revealIngredient(location, encoded) {
  requestAnimationFrame(() => setTimeout(() => {
    const box = document.getElementById(`inline-${location}-${encoded}`);
    const row = box?.closest('.shop-row') || box?.closest('.card') || box?.parentElement;
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.classList.add('just-edited'); setTimeout(() => row.classList.remove('just-edited'), 1600);
  }, 30));
}
