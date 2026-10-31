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
function nutritionHTML(id, servings) {
  const nf = recipeNutrition(id, servings); if (!nf) return '';
  const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth;
  if (!nf.counted) return `<details class="card nutrition"><summary><b>Nutrition facts</b><span class="small muted">${nf.missingFacts.length ? 'Not looked up yet' : 'Not available'}</span></summary>
    <p class="small muted">Per serving, from the USDA food database.</p>
    ${nf.missingFacts.length ? (signedIn ? `<button class="btn secondary" onclick="lookUpNutrition(decodeURIComponent('${encId(id)}'))">Look up nutrition facts</button>` : '<p class="small muted">Sign in under ⚙️ Family sync to look up nutrition facts.</p>') : ''}</details>`;
  const fmtN = (k, v) => k === 'calories' ? Math.round(v) : k === 'sodium' ? Math.round(v * 1) : v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  const partial = nf.counted < nf.of;
  return `<details class="card nutrition" ${partial ? '' : ''}><summary><b>Nutrition facts</b><span class="nf-cal"><b>${fmtN('calories', nf.per.calories)}</b> cal per serving${partial || nf.estimate ? ' ≈' : ''}</span></summary>
    <table class="nf-table">${NUTRIENT_ROWS.slice(1).map(([k, label, u]) => `<tr><th scope="row">${label}</th><td>${fmtN(k, nf.per[k])} ${u}</td></tr>`).join('')}</table>
    <p class="tiny muted">Per serving (${fmt(nf.servings)} servings). From USDA FoodData Central. ${partial ? `Counts ${nf.counted} of ${nf.of} ingredients` : 'All ingredients counted'}${nf.estimate ? '; some amounts use typical weights' : ''}.</p>
    ${nf.missingFacts.length && signedIn ? `<p class="small">Not looked up yet: ${esc(nf.missingFacts.join(', '))}. <button class="linkish" onclick="lookUpNutrition(decodeURIComponent('${encId(id)}'))">Look them up</button></p>` : ''}
    ${nf.missingWeight.length ? `<p class="small">Needs a weight to count: ${nf.missingWeight.map(n => `<button class="linkish" onclick="askNutritionWeight(decodeURIComponent('${encId(id)}'),decodeURIComponent('${encId(n)}'))">${esc(n)}</button>`).join(', ')}</p>` : ''}
    <p class="tiny muted">Matched foods: ${(state.data.recipes[id].ingredients || []).map(i => state.itemMeta?.[ingredientKey(i.name)]?.nutrition).filter(Boolean).map(x => esc(x.name)).slice(0, 4).join('; ')}… <button class="linkish" onclick="openNutritionMatches(decodeURIComponent('${encId(id)}'))">check matches</button></p></details>`;
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
