// Units and containers (v19).
// Every ingredient can have:
//   - a container: the package it's bought in, with a real size (e.g. "5 lb bag", "32 fl oz carton", "12 ea. carton")
//   - grams per cup: to convert between volume and weight (asked the first time it's needed)
//   - weight of one: to convert between counts (eggs, cloves, onions) and weight
// Recipe amounts can be weights, volumes, counts, or containers ("2 cans"), and are converted
// into the container's unit for shopping, pantry and cost.
'use strict';

const MASS_G = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOLUME_ML = { tsp: 4.92892, tbsp: 14.7868, cup: 236.588, 'fl oz': 29.5735, ml: 1, l: 1000, pint: 473.176, quart: 946.353, gallon: 3785.41 };
const COUNT_UNITS = { 'ea.': 1, clove: 1, slice: 1, piece: 1, stick: 1, head: 1, bunch: 1, sprig: 1, stalk: 1, fillet: 1, breast: 1, dozen: 12 };
const CONTAINER_WORDS = new Set(['can', 'jar', 'packet', 'package', 'box', 'bottle', 'bag', 'carton', 'tub', 'pouch', 'envelope', 'container', 'pack', 'loaf', 'block', 'bar', 'roll', 'case', 'tray', 'sleeve', 'jug', 'half-gallon']);
const EXTRA_UNIT_NAMES = {
  c: 'cup', 'c.': 'cup', tbs: 'tbsp', tbsps: 'tbsp', 'tbsp.': 'tbsp', tsps: 'tsp', 'tsp.': 'tsp', gal: 'gallon', gallons: 'gallon', qt: 'quart', quarts: 'quart', pt: 'pint', pints: 'pint',
  'g.': 'g', grams: 'g', kgs: 'kg', 'lb.': 'lb', lbs: 'lb', 'oz.': 'oz', ozs: 'oz', 'fl. oz': 'fl oz', 'fl.oz': 'fl oz', 'fl oz.': 'fl oz', mls: 'ml', liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  each: 'ea.', ea: 'ea.', whole: 'ea.', cloves: 'clove', slices: 'slice', pieces: 'piece', sticks: 'stick', heads: 'head', bunches: 'bunch', sprigs: 'sprig', stalks: 'stalk', fillets: 'fillet', breasts: 'breast', dozens: 'dozen',
  cans: 'can', jars: 'jar', packets: 'packet', packages: 'package', pkg: 'package', pkgs: 'package', boxes: 'box', bottles: 'bottle', bags: 'bag', cartons: 'carton', tubs: 'tub', pouches: 'pouch', envelopes: 'envelope', containers: 'container', packs: 'pack', loaves: 'loaf', blocks: 'block', bars: 'bar', rolls: 'roll', jugs: 'jug',
};
function unitName(u) {
  const n = normUnit(u);
  return EXTRA_UNIT_NAMES[n] || n;
}
function unitKind(u) {
  const n = unitName(u);
  if (MASS_G[n]) return 'mass';
  if (VOLUME_ML[n]) return 'volume';
  if (COUNT_UNITS[n]) return 'count';
  if (CONTAINER_WORDS.has(n)) return 'container';
  return n ? 'unknown' : 'none';
}

// Typical values, used (marked "≈") until the family enters their own.
const TYPICAL_GRAMS_PER_CUP = {
  'flour': 120, 'all-purpose flour': 120, 'bread flour': 127, 'whole wheat flour': 120, 'sugar': 200, 'granulated sugar': 200, 'brown sugar': 220, 'powdered sugar': 120,
  'butter': 227, 'spreadable butter': 227, 'rice': 185, 'white rice': 185, 'brown rice': 190, 'oats': 90, 'rolled oats': 90, 'cornstarch': 128, 'cocoa powder': 85, 'honey': 340,
  'shredded cheese': 113, 'shredded cheddar cheese': 113, 'shredded mozzarella cheese': 113, 'shredded mexican cheese': 113, 'cheddar cheese': 113, 'mozzarella cheese': 113, 'parmesan cheese': 99,
  'sour cream': 227, 'ricotta cheese': 227, 'plain greek yogurt': 227, 'cream cheese': 227, 'breadcrumbs': 113, 'frozen mixed vegetables': 142, 'broccoli': 85, 'frozen broccoli': 85,
  'peanut butter': 258, 'chocolate chips': 170, 'mayonnaise': 220, 'ketchup': 240, 'salsa': 240, 'olive oil': 216, 'vegetable oil': 218, 'water': 237, 'milk': 245, 'heavy cream': 238,
  'garlic powder': 155, 'onion powder': 110, 'chili powder': 128, 'ground cumin': 96, 'cumin': 96, 'paprika': 110, 'salt': 292, 'kosher salt': 240, 'black pepper': 110, 'ground black pepper': 110,
  'italian seasoning': 50, 'taco seasoning': 130, 'baking soda': 230, 'baking powder': 230, 'ground cinnamon': 125, 'cinnamon': 125, 'vanilla extract': 208, 'soy sauce': 255, 'worcestershire sauce': 270, 'bbq sauce': 280, 'barbecue sauce': 280,
  'macaroni': 105, 'macaroni pasta': 105, 'penne': 90, 'penne pasta': 90, 'egg noodles': 75, 'frozen peas': 134, 'corn': 154, 'black beans': 172, 'kidney beans': 177, 'diced tomatoes': 240, 'tomato sauce': 245,
};
const TYPICAL_GRAMS_EACH = {
  'eggs': 50, 'egg': 50, 'garlic cloves': 5, 'garlic': 5, 'yellow onions': 150, 'onion': 150, 'onions': 150, 'potatoes': 213, 'russet potatoes': 213, 'lime': 67, 'lemon': 85, 'orange': 130,
  'carrots': 61, 'celery': 40, 'tomatoes': 123, 'bell peppers': 119, 'banana': 118, 'avocado': 150, 'apple': 182, 'boneless skinless chicken breasts': 175, 'hot dogs': 45, 'flour tortillas': 45, 'corn tortillas': 26,
};
function factorFor(key, field, typical) {
  const own = Number(state.itemMeta?.[key]?.[field]);
  if (own > 0) return { value: own, estimate: false };
  const singular = key.replace(/es$/, '').replace(/s$/, '');
  let t = typical[key] ?? typical[singular] ?? typical[key + 's'];
  if (t == null) {
    // "all-purpose white flour" → "flour": the longest typical name the ingredient ends with
    const hit = Object.keys(typical).filter(k => key.endsWith(' ' + k) || singular.endsWith(' ' + k)).sort((a, b) => b.length - a.length)[0];
    if (hit) t = typical[hit];
  }
  return t ? { value: t, estimate: true } : null;
}
const gramsPerCup = key => factorFor(key, 'gramsPerCup', TYPICAL_GRAMS_PER_CUP);
const gramsEach = key => factorFor(key, 'gramsPerEach', TYPICAL_GRAMS_EACH);

// Express an amount in a basic measure: grams, millilitres, or a count.
function toBasic(q, unit, key, depth = 0) {
  const u = unitName(unit), kind = unitKind(u);
  if (kind === 'mass') return { kind, v: q * MASS_G[u], est: false };
  if (kind === 'volume') return { kind, v: q * VOLUME_ML[u], est: false };
  if (kind === 'count') return { kind: countKind(u), v: q * COUNT_UNITS[u], est: false };
  if (kind === 'container') {
    // "2 cans": two of this ingredient's containers, if we know how much one holds
    const pkg = getPackage(key);
    if (pkg && depth === 0 && unitKind(pkg.unit) !== 'container') { const inner = toBasic(q * Number(pkg.qty), pkg.unit, key, 1); if (inner) return inner }
    return { kind: 'container', v: q, est: false };
  }
  return null;
}
// eggs counted "each" and "dozen" are the same family; cloves, slices, heads etc. are each their own
function countKind(u) { return u === 'dozen' || u === 'ea.' ? 'count:ea.' : 'count:' + u }
const isCount = k => String(k).startsWith('count');
function fromBasic(b, unit) {
  const u = unitName(unit), kind = unitKind(u);
  const factor = kind === 'mass' ? MASS_G[u] : kind === 'volume' ? VOLUME_ML[u] : kind === 'count' ? COUNT_UNITS[u] : 1;
  return b.v / factor;
}
// Move a basic amount to another kind using the ingredient's factors. Returns null and what's missing.
function changeKind(b, toKind, key) {
  if (b.kind === toKind) return { b };
  const gpc = gramsPerCup(key), ge = gramsEach(key), ML_PER_CUP = VOLUME_ML.cup;
  // two different count units (cloves vs heads): weight-per-one can't bridge them, ask how many of one is in the other
  if (isCount(b.kind) && isCount(toKind)) return { need: 'pairRate' };
  const toGrams = () => b.kind === 'mass' ? { v: b.v, est: b.est } : b.kind === 'volume' ? (gpc ? { v: b.v / ML_PER_CUP * gpc.value, est: b.est || gpc.estimate } : null) : isCount(b.kind) ? (ge ? { v: b.v * ge.value, est: b.est || ge.estimate } : null) : null;
  const g = toGrams();
  if (!g) return { need: b.kind === 'volume' ? 'gramsPerCup' : isCount(b.kind) ? 'gramsPerEach' : 'containerSize' };
  if (toKind === 'mass') return { b: { kind: 'mass', v: g.v, est: g.est } };
  if (toKind === 'volume') return gpc ? { b: { kind: 'volume', v: g.v / gpc.value * ML_PER_CUP, est: g.est || gpc.estimate } } : { need: 'gramsPerCup' };
  if (isCount(toKind)) return ge ? { b: { kind: toKind, v: g.v / ge.value, est: g.est || ge.estimate } } : { need: 'gramsPerEach' };
  return { need: 'containerSize' };
}
// Main conversion. Returns {qty, estimate} or null. conversionNeed() says what to ask for.
function convertDetail(q, from, to, name) {
  const key = ingredientKey(name), f = unitName(from), t = unitName(to);
  if (!Number.isFinite(q)) return { result: null, need: null };
  if (f === t) return { result: { qty: q, estimate: false } };
  const saved = rememberedConversion(key, f, t);
  if (saved) return { result: { qty: q * saved.qty, estimate: false, remembered: true } };
  const a = toBasic(q, f, key);
  if (!a) return { result: null, need: 'unknownUnit' };
  // target: a container word means "how many containers"
  let targetKind = unitKind(t) === 'count' ? countKind(t) : unitKind(t), perContainer = null;
  if (targetKind === 'container') {
    const pkg = getPackage(key);
    if (pkg && unitKind(pkg.unit) !== 'container' && Number(pkg.qty) > 0) { perContainer = toBasic(Number(pkg.qty), pkg.unit, key, 1); targetKind = perContainer.kind }
    else if (a.kind === 'container') return { result: { qty: a.v, estimate: false } };
    else return { result: null, need: 'containerSize' };
  }
  if (targetKind === 'unknown' || targetKind === 'none') return { result: null, need: 'unknownUnit' };
  if (a.kind === 'container') return { result: null, need: 'containerSize' };
  const moved = changeKind(a, targetKind, key);
  if (!moved.b) return { result: null, need: moved.need };
  const qty = perContainer ? moved.b.v / perContainer.v : fromBasic(moved.b, t);
  return { result: { qty, estimate: !!moved.b.est } };
}
function convertAmount(q, from, to, name) { return convertDetail(q, from, to, name).result }
function conversionNeed(q, from, to, name) { const d = convertDetail(q, from, to, name); return d.result ? null : d.need }

function roundAmount(v) { const a = Math.abs(v); return a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100 }
function convertedText(q, unit, name) {
  const pkg = getPackage(name); if (!pkg || !Number.isFinite(q)) return '';
  const target = pkg.unit;
  if (unitName(unit) === unitName(target)) return '';
  const c = convertAmount(q, unit, target, name);
  return c ? `${c.estimate ? '≈ ' : ''}${fmt(roundAmount(c.qty))} ${target}` : '';
}
function packageText(p) {
  if (!p) return '';
  const label = String(p.label || '').trim(), size = `${fmt(p.qty)} ${p.unit}`;
  return label && unitName(label) !== unitName(p.unit) && !['each', 'ea.'].includes(unitName(label)) ? `${size} ${label}` : size;
}
function containerText(name) { return packageText(getPackage(name)) }

// ---------- Asking for a missing factor (shown on top of whatever is open) ----------
let convAsk = null;
function askConversion(name, from, to, done, skip) {
  const key = ingredientKey(name), need = conversionNeed(1, from, to, name);
  if (!need || need === 'unknownUnit') { if (need === 'unknownUnit') alert(`“${from}” isn't a unit the app knows. Use g, oz, lb, cups, tbsp, tsp, ml, each, or a container like can or bag.`); try { (need ? skip : done)?.() } catch (_) {} return }
  convAsk = { key, name, from, to, need, done, skip };
  let el = document.getElementById('convPrompt');
  if (!el) { el = document.createElement('div'); el.id = 'convPrompt'; el.className = 'photo-overlay conv-overlay'; document.body.appendChild(el) }
  const pkg = getPackage(key), label = pkg?.label || unitName(to);
  const unitOpts = (list, sel) => list.map(u => `<option ${u === sel ? 'selected' : ''}>${u}</option>`).join('');
  let body;
  if (need === 'gramsPerCup') {
    const t = TYPICAL_GRAMS_PER_CUP[key];
    body = `<h3>How much does 1 cup of ${esc(name)} weigh?</h3><p class="small muted">Needed to turn cups into ${esc(unitName(to) === 'cup' ? unitName(from) : unitName(to))}. A kitchen scale gives the best answer; the package's nutrition label often lists grams per cup too.</p>
      <div class="row"><input id="convValue" type="number" min="0" step="any" inputmode="decimal" placeholder="${t || 'e.g. 120'}"><select id="convUnit">${unitOpts(['g', 'oz'], 'g')}</select></div>`;
  } else if (need === 'gramsPerEach') {
    const t = TYPICAL_GRAMS_EACH[key], one = ['ea.', 'each'].includes(unitName(from)) ? '' : unitName(from);
    body = `<h3>How much does one ${esc(one ? one + ' of ' + name : name)} weigh?</h3><p class="small muted">Needed to turn a count into a weight or volume.</p>
      <div class="row"><input id="convValue" type="number" min="0" step="any" inputmode="decimal" placeholder="${t || 'e.g. 150'}"><select id="convUnit">${unitOpts(['g', 'oz'], 'g')}</select></div>`;
  } else if (need === 'pairRate') {
    body = `<h3>How many ${esc(unitName(to))} is 1 ${esc(unitName(from))} of ${esc(name)}?</h3><p class="small muted">For example, 1 head of garlic is about 10 cloves.</p>
      <div class="row"><input id="convValue" type="number" min="0" step="any" inputmode="decimal" placeholder="e.g. 10"><span>${esc(unitName(to))}</span></div>`;
  } else {
    body = `<h3>How much is in one ${esc(label)} of ${esc(name)}?</h3><p class="small muted">The size printed on the package, like 15 oz or 32 fl oz. It's saved as this ingredient's container.</p>
      <div class="row"><input id="convValue" type="number" min="0" step="any" inputmode="decimal" placeholder="e.g. 15"><select id="convUnit">${unitOpts(['oz', 'lb', 'g', 'kg', 'fl oz', 'cup', 'ml', 'l', 'ea.'], 'oz')}</select></div>`;
  }
  el.innerHTML = `<div class="photo-dialog" role="dialog" aria-modal="true" aria-label="Conversion">${body}<div class="actions"><button class="btn" onclick="saveConversionPrompt()">Save</button><button class="btn secondary" onclick="closeConversionPrompt(true)">Not now</button></div></div>`;
  el.hidden = false; el.style.display = 'flex';
  setTimeout(() => document.getElementById('convValue')?.focus(), 50);
}
function closeConversionPrompt(skipped) {
  const el = document.getElementById('convPrompt'); if (el) { el.hidden = true; el.style.display = 'none' }
  const a = convAsk; convAsk = null;
  if (skipped && a?.skip) try { a.skip() } catch (_) {}
}
function saveConversionPrompt() {
  const a = convAsk; if (!a) return;
  const v = Number(document.getElementById('convValue')?.value), u = document.getElementById('convUnit')?.value;
  if (!(v > 0)) return alert('Enter a number greater than zero.');
  state.itemMeta ??= {};
  if (a.need === 'pairRate') {
    state.ingredientConversions ??= {};
    state.ingredientConversions[conversionKey(a.key, unitName(a.from), unitName(a.to))] = { rate: v, from: unitName(a.from), to: unitName(a.to), updatedAt: new Date().toISOString() };
  } else if (a.need === 'containerSize') {
    const old = getPackage(a.key) || {}, label = old.label && unitKind(old.label) === 'container' ? old.label : (unitKind(a.to) === 'container' ? unitName(a.to) : (old.label || 'package'));
    state.packagePrefs ??= {}; state.packagePrefs[a.key] = { qty: v, unit: normUnit(u), label };
  } else {
    const grams = u === 'oz' ? v * MASS_G.oz : v;
    state.itemMeta[a.key] = { ...(state.itemMeta[a.key] || {}), [a.need]: Math.round(grams * 10) / 10 };
  }
  const done = a.done; closeConversionPrompt(); save();
  toast('Saved for ' + a.name);
  try { done?.() } catch (_) {}
}

// ---------- In the ingredient editor ----------
function conversionEditorHTML(key, location, encoded) {
  const m = state.itemMeta?.[key] || {}, tc = TYPICAL_GRAMS_PER_CUP[key], te = TYPICAL_GRAMS_EACH[key];
  return `<div class="conv-box"><b class="small">Conversions</b>
    <div class="formrow"><div><label for="gpc-${location}-${encoded}">1 cup weighs (g)</label><input id="gpc-${location}-${encoded}" type="number" min="0" step="any" inputmode="decimal" value="${esc(m.gramsPerCup ?? '')}" placeholder="${tc ? '≈ ' + tc : 'unknown'}"></div>
    <div><label for="gpe-${location}-${encoded}">One weighs (g)</label><input id="gpe-${location}-${encoded}" type="number" min="0" step="any" inputmode="decimal" value="${esc(m.gramsPerEach ?? '')}" placeholder="${te ? '≈ ' + te : 'unknown'}"></div></div>
    <div class="tiny muted">Used to convert cups ↔ weight and counts (like eggs or cloves) ↔ weight. Leave blank to use the typical value shown, if any. Saved with the ingredient.</div></div>`;
}

// ---------- In the recipe editor: container and converted amount for each row ----------
function editRowConversionHTML(idx) {
  const i = window.editingIngredients?.[idx]; if (!i) return '';
  const name = String(i.name || '').trim(); if (!name) return '';
  const pkg = i.newPackage && Number(i.newPackage.qty) > 0 && i.newPackage.unit ? { qty: Number(i.newPackage.qty), unit: i.newPackage.unit, label: i.newPackage.label } : getPackage(name);
  const q = num(i.recipeQty ?? i.qty), unit = i.recipeUnit || i.unit || '';
  if (!pkg) return `<div class="conv-line"><span class="muted">No container size yet.</span> <button type="button" class="btn ghost" onclick="editContainerForRow(${idx})">Set container</button></div>`;
  const ctext = packageText(pkg), editBtn = i.newPackage ? '' : ` <button type="button" class="linkish" onclick="editContainerForRow(${idx})">change</button>`;
  let amount = '';
  if (q !== null && q > 0 && unit) {
    const c = convertAmount(q, unit, pkg.unit, name);
    if (c && unitName(unit) !== unitName(pkg.unit)) amount = ` · <b>${esc(fmt(q))} ${esc(unit)} ${c.estimate ? '≈' : '='} ${esc(fmt(roundAmount(c.qty)))} ${esc(pkg.unit)}</b>`;
    else if (!c) {
      const need = conversionNeed(q, unit, pkg.unit, name);
      amount = need === 'unknownUnit' ? ` · <span class="warning">Unknown unit “${esc(unit)}”</span>` : ` · <button type="button" class="btn ghost" onclick="askConversionForRow(${idx})">Set ${unitName(unit)} → ${esc(unitName(pkg.unit))} conversion</button>`;
    }
  }
  return `<div class="conv-line"><span class="muted">Container:</span> ${esc(ctext)}${editBtn}${amount}</div>`;
}
function refreshEditRowConversion(idx) { const el = document.getElementById('convrow-' + idx); if (el) el.innerHTML = editRowConversionHTML(idx) }
function askConversionForRow(idx) {
  const i = window.editingIngredients[idx], pkg = getPackage(i.name);
  askConversion(i.name, i.recipeUnit || i.unit, pkg?.unit || '', () => refreshEditRowConversion(idx));
}
function editContainerForRow(idx) {
  const i = window.editingIngredients[idx];
  if (!String(i.name || '').trim()) return toast('Enter the ingredient name first');
  const p = getPackage(i.name) || displayPackage(i.name);
  i.newPackage = { qty: p?.qty ?? '', unit: p?.unit ?? '', label: p?.label ?? '' };
  renderEditIngredients();
}
// after saving a recipe: ask, one at a time, for anything needed to convert its amounts
function conversionsNeeded(ingredients) {
  const out = [], seen = new Set();
  for (const i of ingredients) {
    const q = num(i.qty), pkg = getPackage(i.name);
    if (q === null || !pkg || !i.unit) continue;
    const need = conversionNeed(q, i.unit, pkg.unit, i.name);
    if (!need || need === 'unknownUnit') continue;
    const id = ingredientKey(i.name) + '|' + need;
    if (!seen.has(id)) { seen.add(id); out.push({ name: i.name, from: i.unit, to: pkg.unit }) }
  }
  return out;
}
function askConversionsInTurn(list, finished) {
  const next = () => { const x = list.shift(); if (!x) return finished?.(); askConversion(x.name, x.from, x.to, next, next) };
  next();
}
// recipe saving: original amount plus the converted amount in the container's unit
function convertedForSave(i) {
  const q = num(i.qty), pkg = getPackage(i.name);
  if (q === null || !pkg || unitName(i.unit) === unitName(pkg.unit)) return null;
  const c = convertAmount(q, i.unit, pkg.unit, i.name);
  return c ? { qty: roundAmount(c.qty), unit: pkg.unit, estimate: !!c.estimate } : null;
}
// refresh a recipe's saved "converted" amounts (after a factor or container is set)
function refreshRecipeConversions(id) {
  const r = state.data.recipes[id]; if (!r) return;
  let changed = false;
  for (const i of r.ingredients || []) {
    const c = convertedForSave(i), before = JSON.stringify(i.converted || null);
    if (c) i.converted = c; else delete i.converted;
    if (JSON.stringify(i.converted || null) !== before) changed = true;
  }
  if (changed) save();
}
function refreshAllRecipeConversions() { for (const id of Object.keys(state.data.recipes || {})) refreshRecipeConversions(id) }
// shopping list "Set conversion" button
function askShopConversion(encoded) {
  const key = decodeURIComponent(encoded), row = (window.lastShoppingRows || []).find(x => ingredientKey(x.name) === key);
  if (!row?.convNeed) return;
  askConversion(row.name, row.convNeed.from, row.convNeed.to, () => { refreshAllRecipeConversions(); renderShopping() });
}
