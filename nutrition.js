// Nutrition facts (v25) from USDA FoodData Central (public domain), via the family's Supabase helper.
// state.itemMeta[k].nutrition = {fdcId, name, per100g: {calories, protein, fat, satFat, carbs, fiber, sugar, sodium}, at, pinned}
// A recipe's facts per serving = sum over ingredients of (grams × per-100 g values) ÷ servings.
'use strict';

const NUTRIENT_ROWS = [['calories', 'Calories', ''], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fiber', 'Fiber', 'g'], ['sugar', 'Sugar', 'g'], ['fat', 'Fat', 'g'], ['satFat', 'Saturated fat', 'g'], ['sodium', 'Sodium', 'mg']];
// grams of an ingredient amount, using the same conversions as shopping (cups → grams needs a weight per cup, etc.)
function gramsOf(q, unit, name) {
  if (!(q > 0)) return null;
  const c = typeof convertAmount === 'function' ? convertAmount(q, unit || 'ea.', 'g', name) : null;
  return c && c.qty > 0 ? { g: c.qty, estimate: !!c.estimate } : null;
}
// per serving; tells which ingredients couldn't be counted and why
function recipeNutrition(id, servings) {
  const r = state.data.recipes[id]; if (!r) return null;
  const n = servings || r.baseServings || 4, scale = n / (r.baseServings || 4);
  const total = Object.fromEntries(NUTRIENT_ROWS.map(([k]) => [k, 0]));
  const missingFacts = [], missingWeight = []; let counted = 0, estimate = false, skipped = 0;
  for (const i of r.ingredients || []) {
    const q = num(i.qty);
    if (q === null || q <= 0) { skipped++; continue }          // "salt to taste"
    const key = ingredientKey(i.name), facts = state.itemMeta?.[key]?.nutrition?.per100g;
    if (!facts) { missingFacts.push(i.name); continue }
    const g = gramsOf(q * scale, i.unit, i.name);
    if (!g) { missingWeight.push(i.name); continue }
    for (const [k] of NUTRIENT_ROWS) total[k] += (Number(facts[k]) || 0) * g.g / 100;
    counted++; if (g.estimate) estimate = true;
  }
  const per = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v / n]));
  return { per, counted, of: (r.ingredients || []).length - skipped, missingFacts, missingWeight, estimate, servings: n };
}
// ---------- looks ----------
// FDA Daily Values (2,000-calorie diet). Sugar has no daily value for total sugars.
const DAILY_VALUES = { calories: 2000, protein: 50, carbs: 275, fiber: 28, fat: 78, satFat: 20, sodium: 2300 };
const MACRO_COLORS = { protein: 'var(--nf-protein)', carbs: 'var(--nf-carbs)', fat: 'var(--nf-fat)', fiber: 'var(--nf-fiber)', calories: 'var(--nf-cal)' };
function nfRound(k, v) { return k === 'calories' || k === 'sodium' ? Math.round(v) : v < 10 ? Math.round(v * 10) / 10 : Math.round(v) }
// a ring: segments [{frac, color}] around a circle, with something in the middle
function ringSVG(segments, size = 120, stroke = 12, center = '', label = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, gap = segments.filter(x => x.frac > 0).length > 1 ? 2.5 : 0;
  let at = 0;
  const arcs = segments.filter(x => x.frac > 0.001).map(x => {
    const len = Math.max(0, x.frac * c - gap), arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${x.color}" stroke-width="${stroke}" stroke-linecap="${gap ? 'butt' : 'round'}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-at}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    at += x.frac * c; return arc;
  }).join('');
  return `<div class="nf-ring" style="width:${size}px;height:${size}px" ${label ? `role="img" aria-label="${esc(label)}"` : ''}><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--nf-track)" stroke-width="${stroke}"/>${arcs}</svg><div class="nf-ring-center">${center}</div></div>`;
}
// short, honest labels from the FDA "high" (≥20% DV) and "low" (≤5% DV) rules
function nutritionBadges(per) {
  const pct = k => per[k] / DAILY_VALUES[k] * 100, out = [];
  if (pct('protein') >= 20) out.push(['good', 'High protein']);
  if (pct('fiber') >= 20) out.push(['good', 'High fiber']); else if (pct('fiber') >= 10) out.push(['good', 'Good fiber']);
  if (pct('sodium') >= 20) out.push(['warn', 'High sodium']); else if (pct('sodium') <= 5) out.push(['good', 'Low sodium']);
  if (pct('satFat') >= 20) out.push(['warn', 'High saturated fat']);
  if (per.sugar >= 20) out.push(['warn', 'High sugar']);
  return out;
}
function nutritionHTML(id, servings) {
  const nf = recipeNutrition(id, servings); if (!nf) return '';
  const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth;
  if (!nf.counted) return `<div class="card nutrition nf-empty"><div class="nf-head"><h3>Nutrition</h3></div>
    <p class="small muted">Calories, protein, carbs and more per serving, from the USDA food database.</p>
    ${nf.missingFacts.length ? (signedIn ? `<button class="btn secondary" onclick="lookUpNutrition(decodeURIComponent('${encId(id)}'))">🔎 Look up nutrition facts</button>` : '<p class="small muted">Sign in under ⚙️ Family sync to look up nutrition facts.</p>') : ''}
    ${nf.missingWeight.length ? `<p class="small">Needs a weight to count: ${nf.missingWeight.map(n => `<button class="linkish" onclick="askNutritionWeight(decodeURIComponent('${encId(id)}'),decodeURIComponent('${encId(n)}'))">${esc(n)}</button>`).join(', ')}</p>` : ''}</div>`;
  const p = nf.per, partial = nf.counted < nf.of, approx = partial || nf.estimate ? '≈' : '';
  const kcal = { protein: p.protein * 4, carbs: p.carbs * 4, fat: p.fat * 9 }, kTotal = kcal.protein + kcal.carbs + kcal.fat || 1;
  const ring = ringSVG(['protein', 'carbs', 'fat'].map(k => ({ frac: kcal[k] / kTotal, color: MACRO_COLORS[k] })), 132, 13,
    `<b>${approx}${nfRound('calories', p.calories)}</b><span>calories</span>`, `${Math.round(p.calories)} calories per serving`);
  const legend = [['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']].map(([k, label]) => `<div class="nf-macro"><span class="nf-dot" style="background:${MACRO_COLORS[k]}"></span><span class="nf-macro-name">${label}</span><b>${nfRound(k, p[k])} g</b><span class="nf-macro-pct">${Math.round(kcal[k] / kTotal * 100)}%</span></div>`).join('');
  const badges = nutritionBadges(p);
  const rows = [['calories', 'Calories', ''], ['fat', 'Fat', 'g'], ['satFat', 'Saturated fat', 'g', true], ['carbs', 'Carbs', 'g'], ['fiber', 'Fiber', 'g', true], ['sugar', 'Sugars', 'g', true], ['protein', 'Protein', 'g'], ['sodium', 'Sodium', 'mg']]
    .map(([k, label, u, sub]) => { const dv = DAILY_VALUES[k], pct = dv ? Math.round(p[k] / dv * 100) : null;
      return `<div class="nf-row ${sub ? 'sub' : ''}"><span class="nf-name">${label}</span><span class="nf-val">${nfRound(k, p[k])}${u ? ' ' + u : ''}</span><span class="nf-pct">${pct != null ? pct + '%' : ''}</span>${pct != null ? `<span class="nf-bar"><span style="width:${Math.min(100, pct)}%;background:${k === 'sodium' || k === 'satFat' ? (pct >= 20 ? 'var(--nf-warn)' : 'var(--nf-fiber)') : MACRO_COLORS[k] || 'var(--nf-fiber)'}"></span></span>` : '<span class="nf-bar none"></span>'}</div>` }).join('');
  return `<div class="card nutrition nf-card">
    <div class="nf-head"><h3>Nutrition</h3><span class="small muted">Per serving${nf.servings ? ' · ' + fmt(nf.servings) + ' servings' : ''}</span></div>
    <div class="nf-hero">${ring}<div class="nf-legend">${legend}</div></div>
    ${badges.length ? `<div class="nf-badges">${badges.map(([t, b]) => `<span class="nf-badge ${t}">${t === 'good' ? '✓' : '!'} ${b}</span>`).join('')}</div>` : ''}
    <details class="nf-details"><summary><span>Nutrition per serving</span><span class="small muted">% Daily Value</span></summary>
      <div class="nf-rows">${rows}</div>
      <p class="tiny muted">% Daily Value is based on a 2,000-calorie diet. Calories split shows where the calories come from. From USDA FoodData Central.</p>
      <p class="tiny muted">Matched foods: ${(state.data.recipes[id].ingredients || []).map(i => state.itemMeta?.[ingredientKey(i.name)]?.nutrition).filter(Boolean).map(x => esc(x.name)).slice(0, 3).join('; ')}… <button class="linkish" onclick="openNutritionMatches(decodeURIComponent('${encId(id)}'))">Review matches</button></p>
    </details>
    ${partial ? `<p class="nf-note small">${approx ? '≈ ' : ''}Counts ${nf.counted} of ${nf.of} ingredients.${nf.missingFacts.length && signedIn ? ` <button class="linkish" onclick="lookUpNutrition(decodeURIComponent('${encId(id)}'))">Look up ${esc(nf.missingFacts.slice(0, 3).join(', '))}${nf.missingFacts.length > 3 ? '…' : ''}</button>` : nf.missingFacts.length ? ' Missing: ' + esc(nf.missingFacts.join(', ')) + '.' : ''}${nf.missingWeight.length ? ` Needs a weight: ${nf.missingWeight.map(n => `<button class="linkish" onclick="askNutritionWeight(decodeURIComponent('${encId(id)}'),decodeURIComponent('${encId(n)}'))">${esc(n)}</button>`).join(', ')}` : ''}</p>` : nf.estimate ? '<p class="nf-note tiny muted">Some amounts use typical weights.</p>' : ''}
  </div>`;
}
// recipe cards: calories per serving, when most ingredients are counted
function recipeCaloriePill(id) {
  const nf = recipeNutrition(id); if (!nf || !nf.counted || nf.counted < nf.of * 0.6) return '';
  return `<span class="pill cal-pill">🔥 ${Math.round(nf.per.calories)} cal</span>`;
}

// ---------- a planned day: per person, one serving of each meal ----------
function dayNutrition(date) {
  const out = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, meals: [], missing: [] };
  for (const meal of MEALS) for (const [, v] of planEntries(date, meal)) {
    const nf = recipeNutrition(v.recipe);
    if (!nf || !nf.counted) { out.missing.push(v.recipe); out.meals.push({ meal, rid: v.recipe, cal: null }); continue }
    for (const k of ['calories', 'protein', 'carbs', 'fat', 'fiber']) out[k] += nf.per[k];
    out.meals.push({ meal, rid: v.recipe, cal: nf.per.calories, partial: nf.counted < nf.of });
  }
  return out;
}
function nutritionGoals() {
  const cal = Number(state.planPrefs?.calorieGoal) || 2000;
  // balanced: 20% protein, 50% carbs, 30% fat; fiber 14 g per 1,000 calories
  return { calories: cal, protein: Math.round(cal * .2 / 4), carbs: Math.round(cal * .5 / 4), fat: Math.round(cal * .3 / 9), fiber: Math.round(cal / 1000 * 14) };
}
function dayCaloriesPill(date) {
  const d = dayNutrition(date); if (!d.meals.length || d.meals.every(m => m.cal == null)) return '';
  return `<button type="button" class="day-cal" onclick="openDayNutrition('${date}')" aria-label="Nutrition for ${esc(dayTitle(date))}">🔥 ${d.missing.length || d.meals.some(m => m.partial) ? '≈' : ''}${Math.round(d.calories).toLocaleString()} cal</button>`;
}
function openDayNutrition(date) {
  const d = dayNutrition(date), g = nutritionGoals();
  const rings = [['calories', 'Cal', ''], ['carbs', 'Carbs', 'g'], ['fiber', 'Fiber', 'g'], ['protein', 'Protein', 'g'], ['fat', 'Fat', 'g']].map(([k, label, u]) => {
    const frac = Math.min(1, d[k] / g[k]);
    return `<div class="nf-goal">${ringSVG([{ frac, color: MACRO_COLORS[k] }], 64, 6, `<b>${Math.round(d[k]).toLocaleString()}${u}</b>`, `${label}: ${Math.round(d[k])}${u} of ${g[k]}${u}`)}<span>${label}</span><small>of ${g[k].toLocaleString()}${u}</small></div>`;
  }).join('');
  openModal(`<div class="row between"><h2>${esc(dayTitle(date))}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div class="nf-head"><div><b>Nutrition per person</b><div class="small muted">One serving of each planned meal</div></div></div>
    <div class="nf-goals">${rings}</div>
    <div class="nf-day-meals">${d.meals.map(m => { const r = state.data.recipes[m.rid], ph = typeof recipePhotoSrc === 'function' && r ? recipePhotoSrc(r) : '';
      return `<button class="nf-meal" onclick="openRecipe(decodeURIComponent('${encId(m.rid)}'))">${ph ? `<img src="${esc(ph)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'nf-meal-ph',textContent:'🍽️'}))">` : '<span class="nf-meal-ph">🍽️</span>'}<span class="grow"><b>${esc(recipeName(m.rid))}</b><small>${esc(m.meal)}</small></span><span class="nf-meal-cal">${m.cal == null ? '<small>No facts yet</small>' : (m.partial ? '≈' : '') + Math.round(m.cal) + ' <small>cal</small>'}</span></button>` }).join('')}</div>
    <label for="nfGoal" class="small">Daily calorie goal <span class="muted">(protein, carbs, fat and fiber goals follow a balanced split)</span></label>
    <div class="row"><input id="nfGoal" type="number" min="1000" max="5000" step="50" inputmode="numeric" value="${g.calories}"><button class="btn secondary" onclick="state.planPrefs={...(state.planPrefs||{}),calorieGoal:Math.max(1000,Math.min(5000,Number(document.getElementById('nfGoal').value)||2000))};save();openDayNutrition('${date}')">Set</button></div>
    ${d.missing.length ? `<p class="tiny muted">≈ ${d.missing.length} meal${d.missing.length === 1 ? '' : 's'} without nutrition facts yet; open ${d.missing.length === 1 ? 'it' : 'them'} to look them up.</p>` : ''}
    <p class="tiny muted">Estimates from USDA FoodData Central. Not medical advice.</p>`);
}
// counts (eggs, onions) and volumes (cups of rice) need a weight; reuse the conversion questions
function askNutritionWeight(id, name) {
  const i = state.data.recipes[id]?.ingredients.find(x => x.name === name); if (!i) return;
  askConversion(name, i.unit || 'ea.', 'g', () => renderDetailIngredients(id));
}
async function lookUpNutrition(id, keys) {
  const r = state.data.recipes[id];
  const want = keys || [...new Set((r?.ingredients || []).filter(i => num(i.qty) > 0).map(i => ingredientKey(i.name)).filter(k => !state.itemMeta?.[k]?.nutrition))];
  if (!want.length) return;
  toast('Looking up nutrition facts…');
  try {
    const j = await callHelper({ action: 'nutrition', terms: want });
    state.itemMeta ??= {}; let got = 0;
    for (const k of want) { const x = (j.results?.[k] || [])[0]; if (!x) continue; state.itemMeta[k] = { ...(state.itemMeta[k] || {}), nutrition: { fdcId: x.id, name: x.name, per100g: x.per100g, at: new Date().toISOString() } }; got++ }
    save(); toast(got ? `Found ${got} of ${want.length}` : 'No matches found in the USDA database');
    if (window.currentRecipeId === id) renderDetailIngredients(id);
  } catch (e) { alert(e.message) }
}
// review / change which USDA food each ingredient matched
function openNutritionMatches(id) {
  const r = state.data.recipes[id]; if (!r) return;
  openModal(`<div class="row between"><h2>Nutrition matches</h2><button class="iconbtn" aria-label="Close" onclick="openRecipe(decodeURIComponent('${encId(id)}'))">✕</button></div>
    <p class="small muted">Each ingredient is matched to a food in the USDA database. Tap one to change it.</p>
    <div class="menu-list">${[...new Set(r.ingredients.map(i => ingredientKey(i.name)))].map(k => { const m = state.itemMeta?.[k]?.nutrition; return `<button class="menu-item" onclick="searchNutrition('${encId(id)}','${encId(k)}')"><span class="menu-text"><b>${esc(k)}</b><small>${m ? esc(m.name) + ` · ${Math.round(m.per100g.calories || 0)} cal per 100 g` : 'Not matched yet'}</small></span><span aria-hidden="true">›</span></button>` }).join('')}</div>
    <div class="actions"><button class="btn" onclick="openRecipe(decodeURIComponent('${encId(id)}'))">Done</button></div>`);
}
async function searchNutrition(encId_, encKey, term) {
  const id = decodeURIComponent(encId_), k = decodeURIComponent(encKey); term = term || k;
  openModal(`<div class="row between"><h2>${esc(k)}</h2><button class="iconbtn" aria-label="Close" onclick="openNutritionMatches(decodeURIComponent('${encId_}'))">✕</button></div>
    <div class="row"><input id="nfSearch" value="${esc(term)}" aria-label="Search the USDA database" onkeydown="if(event.key==='Enter')searchNutrition('${encId_}','${encKey}',this.value)"><button class="btn" onclick="searchNutrition('${encId_}','${encKey}',document.getElementById('nfSearch').value)">Search</button></div>
    <div id="nfList" class="menu-list"><p class="small muted">Searching…</p></div>`);
  try {
    const j = await callHelper({ action: 'nutrition', terms: [term] }), list = j.results?.[term] || [];
    window.nfChoices = list;
    document.getElementById('nfList').innerHTML = list.length ? list.map((x, i) => `<button class="menu-item" onclick="pickNutrition('${encId_}','${encKey}',${i})"><span class="menu-text"><b>${esc(x.name)}</b><small>${Math.round(x.per100g.calories || 0)} cal · ${x.per100g.protein ?? '–'} g protein · ${x.per100g.carbs ?? '–'} g carbs per 100 g</small></span></button>`).join('') : '<p class="small muted">Nothing found. Try a simpler word, like "cheddar" or "rice".</p>';
  } catch (e) { document.getElementById('nfList').innerHTML = `<p class="small warning">${esc(e.message)}</p>` }
}
function pickNutrition(encId_, encKey, i) {
  const x = window.nfChoices?.[i]; if (!x) return;
  const k = decodeURIComponent(encKey);
  state.itemMeta ??= {}; state.itemMeta[k] = { ...(state.itemMeta[k] || {}), nutrition: { fdcId: x.id, name: x.name, per100g: x.per100g, at: new Date().toISOString(), pinned: true } };
  save(); openNutritionMatches(decodeURIComponent(encId_));
}
