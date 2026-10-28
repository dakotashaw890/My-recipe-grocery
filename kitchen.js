// Recipe import, "what can I make?", staples, and price history (v16).
// Loaded after the main app script and sync.js; uses their globals.
'use strict';

// =====================================================================
// Ingredient lines: "1 1/2 cups (190 g) flour, sifted" -> {qty:1.5, unit:'cup', name:'flour'}
// =====================================================================
const UNICODE_FRACTIONS = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5', '⅙': '1/6' };
const UNIT_WORDS = [
  [/^(cups?|c)\b\.?/i, 'cup'], [/^(tablespoons?|tbsps?|tbs|tbl|T)\b\.?/, 'tbsp'], [/^(teaspoons?|tsps?|t)\b\.?/, 'tsp'],
  [/^(fluid ounces?|fl\.? ?oz)\b\.?/i, 'fl oz'], [/^(ounces?|oz)\b\.?/i, 'oz'], [/^(pounds?|lbs?)\b\.?/i, 'lb'],
  [/^(grams?|g)\b\.?/i, 'g'], [/^(kilograms?|kgs?)\b\.?/i, 'kg'], [/^(milliliters?|millilitres?|ml)\b\.?/i, 'ml'], [/^(liters?|litres?|l)\b\.?/i, 'l'],
  [/^(pints?|pt)\b\.?/i, 'pint'], [/^(quarts?|qt)\b\.?/i, 'quart'], [/^(gallons?|gal)\b\.?/i, 'gallon'],
  [/^(cans?|tins?)\b/i, 'can'], [/^(jars?)\b/i, 'jar'], [/^(packages?|pkgs?|packs?)\b\.?/i, 'package'], [/^(packets?|envelopes?)\b/i, 'packet'],
  [/^(boxes?)\b/i, 'box'], [/^(bottles?)\b/i, 'bottle'], [/^(bags?)\b/i, 'bag'], [/^(sticks?)\b/i, 'stick'], [/^(slices?)\b/i, 'slice'],
  [/^(pinch(es)?)\b/i, 'pinch'], [/^(dash(es)?)\b/i, 'dash'], [/^(bunch(es)?)\b/i, 'bunch'], [/^(heads?)\b/i, 'head'], [/^(sprigs?)\b/i, 'sprig'],
];
const SIZE_WORDS = /^(large|medium|small|extra[- ]large|jumbo|whole|fresh|heaping|level|generous|scant)\s+/i;

function parseAmount(s) {
  s = s.trim();
  const m = s.match(/^(\d+)\/(\d+)|^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?/);   // "1/2" before "1 1/2" before "1"
  if (!m) return null;
  let v, len = m[0].length;
  if (m[1]) v = Number(m[1]) / Number(m[2]);
  else v = Number(m[3]) + (m[4] ? Number(m[4]) / Number(m[5]) : 0);
  const range = s.slice(len).match(/^\s*(?:-|–|to|or)\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)/i);   // "2-3": shop for the larger amount
  if (range) { const hi = parseAmount(range[1]); if (hi && hi.value > v) v = hi.value; len += range[0].length }
  return { value: v, length: len };
}

function parseIngredientLine(line) {
  let s = String(line || '').replace(/[¼½¾⅓⅔⅛⅜⅝⅞⅕⅙]/g, c => ' ' + UNICODE_FRACTIONS[c]).replace(/(\d)\s+(\d\/)/g, '$1 $2').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[-•*▢☐□]\s*/, '');
  const original = s;
  let qty = null, unit = '';
  const amt = parseAmount(s);
  if (amt) { qty = Math.round(amt.value * 1000) / 1000; s = s.slice(amt.length).trim() }
  else if (/^(a|an|one)\s/i.test(s)) { qty = 1; s = s.replace(/^(a|an|one)\s/i, '') }
  // "(15 ounce) can" -> remember the size note, unit is the container
  let sizeNote = '';
  const paren = s.match(/^\(([^)]*)\)\s*/);
  if (paren) { sizeNote = paren[1]; s = s.slice(paren[0].length) }
  s = s.replace(SIZE_WORDS, '');
  for (const [re, u] of UNIT_WORDS) { const m = s.match(re); if (m && qty !== null) { unit = u; s = s.slice(m[0].length).trim(); break } }
  s = s.replace(/^of\s+/i, '').replace(SIZE_WORDS, '');
  // drop notes: "(about 2 cups)", ", chopped", "; divided", "to taste"
  let name = s.replace(/\([^)]*\)/g, ' ').split(/,|;|\s+-\s+/)[0].replace(/\b(to taste|as needed|for serving|for garnish|optional)\b.*$/i, '').replace(/\s+/g, ' ').trim();
  if (!name) name = original;
  if (qty !== null && !unit) unit = 'ea.';
  if (/^cloves?\s+(of\s+)?garlic$/i.test(name) || /^garlic cloves?$/i.test(name)) { name = 'garlic cloves'; unit = 'ea.' }
  return { qty, unit, name: name.charAt(0).toUpperCase() + name.slice(1), sizeNote, text: original };
}

// Match an imported name to an ingredient the family already uses ("Onions" -> "Yellow onions" is left alone).
function matchKnownIngredient(name) {
  const known = allIngredients(), n = normalizeIngredientName(name);
  const variants = [n, n.replace(/ies$/, 'y'), n.replace(/es$/, ''), n.replace(/s$/, ''), n + 's', n + 'es'];
  const k = known.find(x => variants.includes(normalizeIngredientName(x)));
  if (!k) return null;
  // use the spelling the family's recipes already use ("Ground beef", not "ground beef")
  for (const r of Object.values(state.data.recipes)) for (const i of r.ingredients || []) if (ingredientKey(i.name) === ingredientKey(k)) return i.name;
  return state.pantry?.[ingredientKey(k)]?.name || k.charAt(0).toUpperCase() + k.slice(1);
}

// Plain text pasted from anywhere: title, ingredient lines and steps.
function parseRecipeText(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let mode = null, name = '', servings = null, prepMinutes = null, cookMinutes = null;
  const ingredients = [], steps = [];
  for (const line of lines) {
    if (/^(ingredients?)\s*:?$/i.test(line)) { mode = 'ing'; continue }
    if (/^(directions?|instructions?|method|steps?|preparation)\s*:?$/i.test(line)) { mode = 'steps'; continue }
    const serv = line.match(/^(serves|servings|yield|makes)\s*:?\s*(\d+)/i);
    if (serv) { servings = Number(serv[2]); continue }
    const tm = line.match(/^(prep|preparation|cook|cooking|bake|baking)(?:\s*time)?\s*:?\s*(.+)$/i);
    if (tm && parseDuration(tm[2]) != null && !mode) { if (/^prep/i.test(tm[1])) prepMinutes = parseDuration(tm[2]); else cookMinutes = parseDuration(tm[2]); continue }
    const looksLikeIngredient = /^[-•*▢☐□]?\s*(\d|[¼½¾⅓⅔⅛]|a |an |one )/i.test(line) && line.length < 90;
    if (!name && !mode && !looksLikeIngredient && line.length < 80) { name = line; continue }
    if (mode === 'steps' || (mode !== 'ing' && !looksLikeIngredient)) steps.push(line.replace(/^\s*(step\s*)?\d+[.):]\s*/i, ''));
    else ingredients.push(line);
  }
  return { name, servings, ingredients, steps, prepMinutes, cookMinutes };
}

// =====================================================================
// Import screen
// =====================================================================
function openRecipeImport() {
  closeModal();
  const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth && syncConfigured;
  openModal(`<div class="row between"><h2>Import a recipe</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <div class="card"><h3>From a website</h3>
      ${signedIn ? '' : '<p class="small warning">Sign in under ⚙️ Family sync to import from links. Pasting text works without signing in.</p>'}
      <label for="importUrl">Recipe link</label><input id="importUrl" type="url" inputmode="url" placeholder="https://www.allrecipes.com/recipe/…" ${signedIn ? '' : 'disabled'}>
      <div class="actions"><button class="btn" onclick="importFromLink()" ${signedIn ? '' : 'disabled'}>Import from link</button></div>
      <p class="tiny muted">Tip: in your browser, tap Share → Copy link on the recipe page, then paste it here.</p></div>
    <div class="card"><h3>Paste recipe text</h3>
      <label for="importText">Copy the recipe from anywhere (a site, an email, a note) and paste it here</label>
      <textarea id="importText" rows="8" placeholder="Grandma's Chili&#10;Serves 6&#10;Ingredients&#10;1 1/2 lb ground beef&#10;2 cans kidney beans&#10;Directions&#10;Brown the beef…"></textarea>
      <div class="actions"><button class="btn secondary" onclick="importFromText()">Read recipe text</button></div></div>
    <div id="importMsg" class="small" role="status"></div>`);
}
function importMessage(text, bad) { const el = document.getElementById('importMsg'); if (el) { el.textContent = text; el.className = 'small ' + (bad ? 'warning' : 'muted') } }

async function importFromLink() {
  const url = (document.getElementById('importUrl')?.value || '').trim();
  if (!/^https?:\/\//i.test(url)) return importMessage('Paste the full link, starting with https://', true);
  const btns = document.querySelectorAll('#sheet button'); btns.forEach(b => b.disabled = true);
  importMessage('Reading the recipe…');
  try {
    const fn = String(SYNC_CFG.importFunction || 'recipe-import').trim();
    const r = await fetch(SYNC_URL + '/functions/v1/' + encodeURIComponent(fn), {
      method: 'POST',
      headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const j = await readJSON(r);
    if (r.status === 404 && !j?.error) throw new Error('The import helper wasn\'t found in Supabase. Check that its name matches importFunction in sync-config.js (see IMPORT-SETUP.md), or use Paste recipe text.');
    if (!r.ok) throw new Error(j?.error || j?.message || 'Import failed (' + r.status + ')');
    openImportedRecipe({ name: j.name, servings: j.servings, ingredients: j.ingredients, steps: j.steps, photoUrl: j.image, sourceUrl: j.sourceUrl || url, prepMinutes: parseDuration(j.prepTime), cookMinutes: parseDuration(j.cookTime) });
  } catch (e) {
    btns.forEach(b => b.disabled = false);
    // A blocked request (helper missing, misnamed, or "Verify JWT" on) looks like a network error to the browser.
    importMessage(e instanceof TypeError
      ? (navigator.onLine === false ? 'You\'re offline. Connect to the internet and try again.'
        : 'The import helper didn\'t answer. In Supabase → Edge Functions, check the function name matches importFunction in sync-config.js and that "Verify JWT" is turned off (see IMPORT-SETUP.md). Paste recipe text works meanwhile.')
      : e.message, true);
  }
}
function importFromText() {
  const p = parseRecipeText(document.getElementById('importText')?.value);
  if (!p.ingredients.length) return importMessage('No ingredient lines found. Put each ingredient on its own line, starting with an amount (like "2 cups milk").', true);
  openImportedRecipe({ name: p.name, servings: p.servings, ingredients: p.ingredients, steps: p.steps, prepMinutes: p.prepMinutes, cookMinutes: p.cookMinutes });
}
function openImportedRecipe(src) {
  let name = (src.name || 'Imported recipe').trim(), n = 2;
  const base = name; while (recipeIdByName(name)) name = base + ' ' + n++;
  const ingredients = src.ingredients.map(line => {
    const p = parseIngredientLine(line), known = matchKnownIngredient(p.name);
    return { name: known || p.name, qty: p.qty ?? '', unit: p.unit, container: p.sizeNote, existingSelected: !!known, importedText: p.text };
  });
  openRecipeEditor(null, { name, baseServings: src.servings || 4, prepMinutes: src.prepMinutes ?? null, cookMinutes: src.cookMinutes ?? null, directions: src.steps || [], ingredients, photoUrl: src.photoUrl || '', sourceUrl: src.sourceUrl || '', sourceType: src.sourceUrl ? 'Imported from website' : 'Imported from text' });
}

// =====================================================================
// What can I make?  (pantry vs. recipe)
// =====================================================================
function pantryPacks(key) { return Number(state.pantry?.[key]?.qty || 0) }
function recipeReadiness(name, servings) {
  const r = state.data.recipes[name];
  if (!r) return null;
  const scale = (servings || r.baseServings) / r.baseServings, missing = [], short = [];
  for (const i of r.ingredients || []) {
    const key = ingredientKey(i.name), q = num(i.qty);
    if (q === null || q <= 0) continue;                                   // "salt to taste"
    const packs = pantryPacks(key);
    if (packs <= 0) { missing.push(i.name); continue }
    const pkg = getPackage(i.name);
    if (!pkg) continue;                                                   // on hand, amount unknown: assume enough
    const need = compatible(q, i.unit, pkg.unit, key);
    if (!need) continue;
    if (packs * pkg.qty + 1e-9 < need.qty * scale) short.push(i.name);
  }
  const lacking = [...missing, ...short];
  return { ready: !lacking.length, lacking, missing, short };
}
function readinessPill(name) {
  const x = recipeReadiness(name);
  if (!x) return '';
  if (x.ready) return '<span class="pill pill-ready">✓ Ready to cook</span>';
  if (x.lacking.length <= 2) return `<span class="pill pill-almost" title="${esc(x.lacking.join(', '))}">Need ${x.lacking.length}: ${esc(x.lacking.join(', '))}</span>`;
  return '';
}
function readyRecipeNames(maxLacking = 2) {
  return Object.keys(state.data.recipes).map(n => [n, recipeReadiness(n)]).filter(([, x]) => x && x.lacking.length <= maxLacking)
    .sort((a, b) => a[1].lacking.length - b[1].lacking.length || recipeName(a[0]).localeCompare(recipeName(b[0]))).map(([n]) => n);
}
function readyHomeCardHTML() {
  const names = readyRecipeNames(0);
  const almost = readyRecipeNames(1).length - names.length;
  if (!names.length && !almost) return '';
  return `<div class="card ready-card"><div class="row between"><div><b>${names.length ? `🍳 ${names.length} recipe${names.length === 1 ? '' : 's'} ready to cook` : '🍳 Almost ready to cook'}</b><div class="small muted">${names.length ? esc(names.slice(0, 3).map(recipeName).join(' · ')) + (names.length > 3 ? ' …' : '') : ''}${almost ? (names.length ? ' · ' : '') + almost + ' more need just 1 item' : ''}</div></div><button class="btn secondary" onclick="showScreen('recipes');setRecipeFilter('ready')">See them</button></div></div>`;
}

// =====================================================================
// Staples: keep at least N packages on hand
// =====================================================================
function stapleMin(key) { return Number(state.itemMeta?.[key]?.stapleMin || 0) }
// Adds staple needs to the shopping rows computed by renderShopping (pantry already subtracted).
function addStapleRows(rows) {
  const byKey = new Map(rows.map(r => [ingredientKey(r.name), r]));
  for (const [key, meta] of Object.entries(state.itemMeta || {})) {
    const min = Number(meta?.stapleMin || 0);
    if (!(min > 0)) continue;
    const pkg = getPackage(key);
    if (!pkg) continue;
    const stock = pantryPacks(key) * pkg.qty, row = byKey.get(key);
    if (row && row.pkg && normUnit(row.pkg.unit) === normUnit(pkg.unit)) {
      const leftover = stock - (row.pantryUsed || 0), extra = Math.max(0, min * pkg.qty - leftover);
      if (extra > 1e-9) { row.qty += extra; row.originalQty += extra; row.staple = true; row.issues = (row.issues || []) }
      continue;
    }
    if (row) continue;
    const need = Math.max(0, min * pkg.qty - stock);
    if (need <= 1e-9) continue;
    const name = state.pantry?.[key]?.name || key.charAt(0).toUpperCase() + key.slice(1);
    rows.push({ name, unit: pkg.unit, qty: need, originalQty: need, pkg, issues: [], sources: ['Staple'], staple: true, pantryPacks: pantryPacks(key), pantryUsed: 0 });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
function saveStaple(encoded, location) {
  const key = decodeURIComponent(encoded), v = Number(document.getElementById(`staple-${location}-${encoded}`)?.value || 0);
  if (!(v >= 0)) return alert('Enter how many packages to keep on hand (0 = not a staple).');
  if (v > 0 && !getPackage(key)) return alert('Save a package size for this ingredient first, then set it as a staple.');
  state.itemMeta ??= {}; state.itemMeta[key] = { ...(state.itemMeta[key] || {}) };
  if (v > 0) state.itemMeta[key].stapleMin = v; else delete state.itemMeta[key].stapleMin;
  save(); toast(v > 0 ? `Staple: keep ${fmt(v)} on hand` : 'No longer a staple');
}
function stapleEditorHTML(key, location, encoded) {
  const pkg = getPackage(key), min = stapleMin(key);
  return `<div class="staple-box"><label for="staple-${location}-${encoded}">⭐ Staple: keep at least this many ${esc(pkg ? pkg.label + 's' : 'packages')} on hand</label>
    <div class="row"><input id="staple-${location}-${encoded}" class="qty" type="number" min="0" step="1" value="${min || ''}" placeholder="0"><button class="btn secondary" onclick="saveStaple('${encoded}','${location}')">Save</button></div>
    <div class="tiny muted">When the pantry drops below this, it goes on the shopping list automatically. 0 or blank = not a staple.</div></div>`;
}

// =====================================================================
// Price history and finishing a shopping trip
// =====================================================================
function priceHistory(key) { return (state.itemMeta?.[key]?.priceHistory || []).slice() }
function priceHistoryHTML(key) {
  const h = priceHistory(key);
  if (!h.length) return '<div class="tiny muted">No prices recorded yet. They\'re saved when you finish a shopping trip.</div>';
  const last = h[h.length - 1], avg = h.reduce((s, x) => s + x.price, 0) / h.length;
  const prev = h.length > 1 ? h[h.length - 2].price : null, trend = prev == null ? '' : last.price > prev + 0.005 ? ' ▲' : last.price < prev - 0.005 ? ' ▼' : ' =';
  return `<div class="price-history"><div><b>Last paid $${last.price.toFixed(2)}${trend}</b> <span class="small muted">${esc(last.store || '')} · ${esc(last.date)}</span></div>
    <div class="small muted">Average $${avg.toFixed(2)} over ${h.length} trip${h.length === 1 ? '' : 's'} · low $${Math.min(...h.map(x => x.price)).toFixed(2)} · high $${Math.max(...h.map(x => x.price)).toFixed(2)}</div>
    <div class="price-spark" aria-hidden="true">${h.slice(-12).map(x => `<span style="height:${Math.max(12, Math.round(x.price / Math.max(...h.slice(-12).map(y => y.price)) * 100))}%" title="$${x.price.toFixed(2)} ${esc(x.date)}"></span>`).join('')}</div></div>`;
}

function packsToBuy(x) {
  const p = x.pkg, issues = x.issues || [];
  const safe = p && issues.every(t => !t.startsWith('Cannot') && !t.startsWith('Conversion needed') && !t.startsWith('Check recipe'));
  return safe && x.qty > 0 ? Math.ceil(x.qty / p.qty - 1e-9) : 1;
}
function finishTrip() {
  if (!window.lastShoppingRows) renderShopping();
  const rows = (window.lastShoppingRows || []).filter(x => state.checks[x.name.toLowerCase()]);
  if (!rows.length) return toast('Check off what you bought first');
  const stores = [...new Set((state.spending?.trips || []).map(t => t.store).filter(Boolean))];
  window.tripRows = rows.map(x => {
    const key = ingredientKey(x.name), last = priceHistory(key).slice(-1)[0], eff = effectivePrice(key);
    return { key, name: x.name, packs: packsToBuy(x), label: x.pkg?.label || 'item', price: last ? last.price.toFixed(2) : (eff ? eff.value.toFixed(2) : '') };
  });
  openModal(`<div class="row between"><h2>Finish shopping trip</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">Enter what you paid per package. Prices are remembered, so estimates and recipe costs become your real numbers.</p>
    <div class="formrow"><div><label for="tripStoreF">Store</label><input id="tripStoreF" list="tripStores" value="${esc(stores[stores.length - 1] || '')}" placeholder="Walmart"><datalist id="tripStores">${stores.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
    <div><label for="tripDateF">Date</label><input id="tripDateF" type="date" value="${localDate()}"></div></div>
    <div id="tripItems">${window.tripRows.map((t, i) => `<div class="trip-row"><div class="ingredient-thumb small">${ingredientPicture(t.name)}</div><div class="grow"><b>${esc(t.name)}</b></div>
      <label class="trip-field"><span>Qty</span><input type="number" min="0" step="1" value="${t.packs}" aria-label="How many ${esc(t.label)}s of ${esc(t.name)}" oninput="tripRows[${i}].packs=Number(this.value)||0;tripTotal()"></label>
      <label class="trip-field"><span>$ each</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${t.price}" aria-label="Price per ${esc(t.label)} of ${esc(t.name)}" oninput="tripRows[${i}].price=this.value;tripTotal()"></label></div>`).join('')}</div>
    <div class="trip-total"><span>Items total</span><b id="tripItemsTotal"></b></div>
    <label for="tripReceipt">Receipt total (optional — include tax and items not on the list)</label><input id="tripReceipt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Uses the items total if blank">
    <label class="check-line"><input id="tripToPantry" type="checkbox" checked> Add these to the pantry</label>
    <div class="actions"><button class="btn" onclick="saveFinishedTrip()">Save trip</button></div>`);
  tripTotal();
}
function tripTotal() {
  const t = (window.tripRows || []).reduce((s, x) => s + (Number(x.price) > 0 ? Number(x.price) * x.packs : 0), 0);
  const el = document.getElementById('tripItemsTotal'); if (el) el.textContent = '$' + t.toFixed(2);
  return t;
}
function saveFinishedTrip() {
  const store = (document.getElementById('tripStoreF').value || '').trim() || 'Store', date = document.getElementById('tripDateF').value || localDate();
  const receipt = Number(document.getElementById('tripReceipt').value), itemsTotal = tripTotal();
  const total = receipt > 0 ? receipt : itemsTotal, toPantry = document.getElementById('tripToPantry').checked;
  if (!(total > 0)) return alert('Enter at least one price or a receipt total.');
  state.spending ??= { trips: [], budget: 0 }; state.spending.trips ??= [];
  const items = [];
  for (const t of window.tripRows) {
    const price = Number(t.price);
    if (price > 0) {
      state.itemMeta ??= {}; const m = state.itemMeta[t.key] = { ...(state.itemMeta[t.key] || {}) };
      m.priceHistory = [...(m.priceHistory || []), { date, price: Math.round(price * 100) / 100, store }].slice(-24);
      m.price = Math.round(price * 100) / 100; m.priceSource = 'paid';
    }
    if (toPantry && t.packs > 0) { state.pantry ??= {}; const cur = state.pantry[t.key]; state.pantry[t.key] = { name: cur?.name || t.name, qty: Number(cur?.qty || 0) + t.packs } }
    delete state.checks[t.key];
    items.push({ key: t.key, name: t.name, packs: t.packs, price: price > 0 ? price : null });
  }
  state.spending.trips.push({ id: String(Date.now()), store, date, total: Math.round(total * 100) / 100, notes: items.length + ' items from the shopping list', items });
  save(); closeModal(); renderShopping(); toast('Trip saved · $' + total.toFixed(2));
}

// Recipe cost from known prices: each ingredient's share of its package.
function recipeCost(name, servings) {
  const r = state.data.recipes[name];
  if (!r) return null;
  const scale = (servings || r.baseServings) / r.baseServings;
  let total = 0, priced = 0, counted = 0;
  for (const i of r.ingredients || []) {
    const key = ingredientKey(i.name), q = num(i.qty);
    if (q === null || q <= 0) continue;
    counted++;
    const pkg = getPackage(i.name), price = effectivePrice(key);
    if (!pkg || !price) continue;
    const conv = compatible(q, i.unit, pkg.unit, key);
    if (!conv) continue;
    total += conv.qty * scale / pkg.qty * price.value; priced++;
  }
  return priced ? { total, perServing: total / (servings || r.baseServings), priced, counted } : null;
}
function recipeCostHTML(name, servings) {
  const c = recipeCost(name, servings);
  if (!c) return '';
  return `<div class="cost-line"><b>≈ $${c.perServing.toFixed(2)} per serving</b> <span class="small muted">· $${c.total.toFixed(2)} for this batch${c.priced < c.counted ? ` · ${c.priced} of ${c.counted} ingredients priced` : ''}</span></div>`;
}

// =====================================================================
// Prep and cook time (total is always calculated, never typed)
// =====================================================================
function formatMinutes(m) {
  m = Math.round(Number(m) || 0);
  if (m <= 0) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} hr${r ? ` ${r} min` : ''}` : `${r} min`;
}
function recipeTimes(r) {
  const prep = Number(r?.prepMinutes) || 0, cook = Number(r?.cookMinutes) || 0;
  return { prep, cook, total: prep + cook };
}
// "PT1H15M" (recipe sites) or "1 hour 15 minutes" / "45 min" / "1:15" (pasted text) -> minutes
function parseDuration(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const iso = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (iso && (iso[1] || iso[2] || iso[3])) return Math.round((Number(iso[1] || 0) * 1440) + Number(iso[2] || 0) * 60 + Number(iso[3] || 0));
  const clock = s.match(/^(\d+):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  let total = 0, found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi)) { found = true; total += /^h/i.test(m[2]) ? Number(m[1]) * 60 : Number(m[1]) }
  if (found) return Math.round(total);
  return /^\d+$/.test(s) ? Number(s) : null;
}
function timeSummaryHTML(r) {
  const t = recipeTimes(r);
  if (!t.total) return '';
  const parts = [t.prep ? `Prep ${formatMinutes(t.prep)}` : '', t.cook ? `Cook ${formatMinutes(t.cook)}` : ''].filter(Boolean);
  return `<div class="time-line">⏱ <b>${formatMinutes(t.total)} total</b>${parts.length > 1 ? ` <span class="small muted">· ${parts.join(' · ')}</span>` : ''}</div>`;
}
function updateTotalTime() {
  const prep = Number(document.getElementById('editPrep')?.value) || 0, cook = Number(document.getElementById('editCook')?.value) || 0;
  const el = document.getElementById('editTotal');
  if (el) el.textContent = prep + cook > 0 ? `Total time: ${formatMinutes(prep + cook)}` : 'Total time is calculated from prep + cook.';
}
