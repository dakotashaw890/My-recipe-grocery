// The meal planner with real dates (v24). Plan entries are keyed "2026-11-02|Dinner|<id>".
// Weeks run Sunday–Saturday. The shopping list covers meals from today through the next 7 days.
'use strict';

let planWeekOffset = 0;   // 0 = this week, 1 = next week, -1 = last week
const SHOP_DAYS_AHEAD = 7;
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function dateOf(iso) { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d, 12) }
function todayISO() { return isoDate(new Date()) }
function addDays(iso, n) { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoDate(d) }
function weekStart(iso = todayISO()) { const d = dateOf(iso); d.setDate(d.getDate() - d.getDay()); return isoDate(d) }
function weekDates(offset = planWeekOffset) { const s = addDays(weekStart(), offset * 7); return Array.from({ length: 7 }, (_, i) => addDays(s, i)) }
function dayNameOf(iso) { return DAYS[dateOf(iso).getDay()] }
function shortDate(iso) { return dateOf(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) }
function dayTitle(iso) { return dateOf(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) }
function planDateOf(key) { return String(key).split('|')[0] }
function planMealOf(key) { return String(key).split('|')[1] }
function isDateKey(key) { return /^\d{4}-\d{2}-\d{2}\|/.test(key) }

// entries for one date and meal, oldest first
function planEntries(date, meal) {
  const prefix = date + '|' + meal;
  return Object.entries(state.plan || {}).filter(([k, v]) => (k === prefix || k.startsWith(prefix + '|')) && v?.recipe && state.data.recipes[v.recipe]).sort(([a], [b]) => a.localeCompare(b));
}
// the meals the shopping list is for: today through a week from today
function shoppingPlanEntries() {
  const from = todayISO(), to = addDays(from, SHOP_DAYS_AHEAD);
  return Object.entries(state.plan || {}).filter(([k, v]) => { const d = planDateOf(k); return v?.recipe && state.data.recipes[v.recipe] && isDateKey(k) && d >= from && d <= to });
}
function selectedForShopping() {
  const out = {};
  for (const [, v] of shoppingPlanEntries()) out[v.recipe] = (out[v.recipe] || 0) + (num(v.servings) || state.data.recipes[v.recipe].baseServings);
  for (const [n, s] of Object.entries(state.selected || {})) if (state.data.recipes[n]) out[n] = (out[n] || 0) + s;
  return out;
}
function shoppingRangeText() { const to = addDays(todayISO(), SHOP_DAYS_AHEAD); return `meals planned from today through ${dayTitle(to)}` }

// ---------- Moving from the old Sunday–Saturday plan ----------
// Old entries ("Monday|Dinner|…") become dates in the current week. Same result on every phone updated the same week.
function upgradePlanToDates(s) {
  const plan = s.plan || {}, start = weekStart();
  const moved = [];
  for (const [k, v] of Object.entries(plan)) {
    const m = k.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\|(.*)$/);
    if (!m) continue;
    const nk = addDays(start, DAYS.indexOf(m[1])) + '|' + m[2];
    if (!plan[nk]) plan[nk] = v;
    delete plan[k]; moved.push(k);
  }
  // remember exactly which entries were renamed, so sync knows those removals are expected
  if (moved.length) try { const prev = JSON.parse(localStorage.getItem(KEY + '-planUpgrade') || '[]'); localStorage.setItem(KEY + '-planUpgrade', JSON.stringify([...new Set([...(Array.isArray(prev) ? prev : []), ...moved])])) } catch (_) {}
  return moved.length;
}
// Keep a few months of history (for "haven't had it in a while"); older plans are tidied away.
function prunePlanHistory(s) {
  const cutoff = addDays(todayISO(), -120);
  let n = 0;
  for (const k of Object.keys(s.plan || {})) if (isDateKey(k) && planDateOf(k) < cutoff) { delete s.plan[k]; n++ }
  return n;
}

// ---------- Screen ----------
function planWeekLabel() {
  const d = weekDates(), base = `${shortDate(d[0])} – ${shortDate(d[6])}`;
  return planWeekOffset === 0 ? `This week · ${base}` : planWeekOffset === 1 ? `Next week · ${base}` : planWeekOffset === -1 ? `Last week · ${base}` : base;
}
function movePlanWeek(n) { planWeekOffset = n === 0 ? 0 : planWeekOffset + n; renderPlanner(); document.getElementById('plan')?.scrollIntoView({ block: 'start' }) }
function renderPlanner() {
  { const pl = document.getElementById('planPrefsLine'); if (pl && typeof prefsSummary === 'function') { const t = prefsSummary(); pl.textContent = t ? 'Preferences: ' + t : '' } }
  const host = document.getElementById('planner'); if (!host) return;
  const today = todayISO(), dates = weekDates();
  const planned = dates.reduce((n, d) => n + MEALS.reduce((m, meal) => m + planEntries(d, meal).length, 0), 0);
  const nav = `<div class="week-nav"><button class="iconbtn" aria-label="Previous week" onclick="movePlanWeek(-1)">‹</button>
    <div class="week-label"><b>${esc(planWeekLabel())}</b><span class="small muted">${planned} meal${planned === 1 ? '' : 's'} planned</span></div>
    <button class="iconbtn" aria-label="Next week" onclick="movePlanWeek(1)">›</button></div>
    ${planWeekOffset !== 0 ? `<div class="week-today"><button class="btn ghost" onclick="movePlanWeek(0)">Back to this week</button></div>` : ''}`;
  host.innerHTML = nav + dates.map(date => {
    const past = date < today, isToday = date === today;
    const rows = MEALS.map(meal => {
      const chips = planEntries(date, meal).map(([key, v]) => `<button type="button" class="plan-chip ${v.cooked ? 'cooked' : ''}" onclick="openPlanned(decodeURIComponent('${encId(key)}'))" aria-label="${esc(recipeName(v.recipe))}, ${esc(String(v.servings))} servings${v.cooked ? ', cooked' : ''}">${v.cooked ? '✓ ' : ''}${esc(recipeName(v.recipe))}<small>${esc(fmt(v.servings))}</small></button>`).join('');
      return `<div class="plan-row"><span class="plan-meal">${meal}</span><div class="plan-chips">${chips}<button type="button" class="plan-add" aria-label="Add ${meal.toLowerCase()} on ${esc(dayTitle(date))}" onclick="chooseMeal('${date}','${meal}')">＋</button></div></div>`;
    }).join('');
    return `<div class="day ${past ? 'past' : ''} ${isToday ? 'today' : ''}"><div class="day-head"><h3>${esc(dayTitle(date))}</h3>${isToday ? '<span class="today-badge">Today</span>' : ''}</div>${rows}</div>`;
  }).join('');
}
// tapping a planned recipe: cook it, change it, or remove it
function openPlanned(key) {
  const v = state.plan[key]; if (!v) return;
  const date = planDateOf(key), meal = planMealOf(key), r = state.data.recipes[v.recipe];
  openModal(`<div class="row between"><h2>${esc(r?.name || 'Recipe')}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">${esc(dayTitle(date))} · ${esc(meal)} · ${esc(fmt(v.servings))} servings${v.cooked ? ' · ✓ cooked' : ''}</p>
    <div class="actions stack"><button class="btn" onclick="previewCook(decodeURIComponent('${encId(v.recipe)}'),decodeURIComponent('${encId(key)}'))">${v.cooked ? '✓ Cook again' : '🍳 Cooked it: update pantry'}</button>
    <button class="btn secondary" onclick="closeModal();openRecipe(decodeURIComponent('${encId(v.recipe)}'))">View recipe</button>
    <button class="btn secondary" onclick="chooseMeal('${date}','${meal}',decodeURIComponent('${encId(key)}'))">Change recipe or servings</button></div>`);
}
function chooseMeal(date, meal, existingKey = '') {
  const key = existingKey || '', current = key ? state.plan[key] || {} : {};
  const options = recipeIdsSorted().filter(n => !key || true).map(n => `<option value="${esc(n)}" ${n === current.recipe ? 'selected' : ''}>${esc(recipeName(n))}</option>`).join('');
  window.editPlanTarget = { date, meal, key };
  openModal(`<div class="row between"><h2>${esc(dayTitle(date))} · ${meal}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <label for="mealRecipe">Recipe</label><select id="mealRecipe"><option value="">— Choose recipe —</option>${options}</select>
    <label for="mealServings">Servings</label><input id="mealServings" type="number" min="0.25" step="0.25" value="${current.servings || 4}">
    <div class="actions"><button class="btn" onclick="saveMeal()">${key ? 'Save changes' : 'Add to plan'}</button>${key ? '<button class="btn danger" onclick="deleteMeal()">Remove</button>' : ''}<button class="btn secondary" onclick="closeModal()">Cancel</button></div>`);
  // servings follow the recipe chosen, unless typed
  const sel = document.getElementById('mealRecipe'), sv = document.getElementById('mealServings');
  let typed = !!key; sv.addEventListener('input', () => { typed = true });
  sel.addEventListener('change', () => { if (!typed && state.data.recipes[sel.value]) sv.value = state.data.recipes[sel.value].baseServings || 4 });
}
function saveMeal() {
  const target = window.editPlanTarget; if (!target) return;
  const recipe = document.getElementById('mealRecipe').value, servings = Number(document.getElementById('mealServings').value);
  if (!recipe || !state.data.recipes[recipe]) return alert('Choose a recipe.');
  if (!Number.isFinite(servings) || servings <= 0) return alert('Enter a valid number of servings.');
  const key = target.key || `${target.date}|${target.meal}|${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  state.plan[key] = { recipe, servings, ...currentMealStatus(key, recipe, servings) };
  save(); closeModal(); toast('Meal plan updated');
}
async function deleteMeal() {
  const key = window.editPlanTarget?.key; if (!key) return;
  if (!await ask('Remove this meal from the plan?\n\nThe recipe stays in your recipes.', { ok: 'Remove' })) return;
  delete state.plan[key]; save(); closeModal();
}
async function clearPlan() {
  const dates = new Set(weekDates()), keys = Object.keys(state.plan).filter(k => dates.has(planDateOf(k)));
  if (!keys.length) return toast('Nothing planned this week');
  if (!await ask(`Clear ${planWeekOffset === 0 ? 'this week\'s' : 'this'} plan?\n\n${keys.length} planned meal${keys.length === 1 ? '' : 's'} for ${planWeekLabel().replace(/^.*· /, '')} will be removed.`, { ok: 'Clear' })) return;
  for (const k of keys) delete state.plan[k];
  save(); toast('Week cleared');
}
// "Same again next week": copy the shown week's meals 7 days ahead (skipping meals already planned there)
function copyPlan() {
  const dates = weekDates();
  let n = 0;
  for (const d of dates) for (const meal of MEALS) {
    const target = addDays(d, 7);
    if (planEntries(target, meal).length) continue;
    planEntries(d, meal).forEach(([, v], i) => { state.plan[`${target}|${meal}|copy${Date.now().toString(36)}${n}${i}`] = { recipe: v.recipe, servings: v.servings }; n++ });
  }
  if (!n) return toast('Nothing to copy (or next week is already planned)');
  save(); planWeekOffset += 1; renderPlanner(); toast(`Copied ${n} meal${n === 1 ? '' : 's'} to the next week`);
}
// what's planned for a meal today (for the home screen)
function todaysMeals() {
  const t = todayISO();
  return MEALS.map(meal => ({ meal, entries: planEntries(t, meal) })).filter(x => x.entries.length);
}
// recipes planned recently (for suggestions: avoid repeating last week's meals)
function recentlyPlanned(days = 14) {
  const from = addDays(todayISO(), -days), to = todayISO(), out = new Set();
  for (const [k, v] of Object.entries(state.plan || {})) { const d = planDateOf(k); if (isDateKey(k) && d >= from && d < to && v?.recipe) out.add(v.recipe) }
  return out;
}
