// Built-in ingredient list: lookups, the search picker and the "only known ingredients" rule.
// Data lives in ingredient-catalog.js. The family's own ingredients always count as known too.
// The list is loaded just after the app opens (it's ~50 KB), so the first screen isn't slowed down.
(function () {
  const n = s => String(s || '').toLowerCase().replace(/[éè]/g, 'e').replace(/ñ/g, 'n').replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const byKey = new Map(), names = [];
  window.CATALOG_NORM = n;
  window.CATALOG_ENTRIES = names;
  window.catalogReady = () => names.length > 0;
  function build() {
    if (names.length || typeof INGREDIENT_CATALOG === 'undefined') return;
    for (const row of INGREDIENT_CATALOG) {
      const [name, dept, aliases, pkg] = row, entry = { name, department: CATALOG_DEPARTMENTS[dept], aliases, pkg: pkg ? { qty: pkg[0], unit: pkg[1], label: pkg[2] } : null };
      names.push(entry);
      for (const t of [name, ...aliases]) { const k = n(t); if (!byKey.has(k)) byKey.set(k, entry) }
    }
  }
  let loading = null;
  window.ensureCatalog = function () {
    build();
    if (names.length) return Promise.resolve(true);
    return loading ??= loadScriptOnce('ingredient-catalog.js?v=27').then(() => {
      build(); familyIndexCache = null;
      // screens drawn before the list arrived get its departments and package sizes
      try { if (document.getElementById('shopping')?.classList.contains('active')) renderShopping() } catch (_) {}
      return true;
    }).catch(e => { loading = null; console.warn('Ingredient list unavailable', e); return false });
  };
  // singular/plural spellings someone might type
  const variants = k => [...new Set([k, k.replace(/ies$/, 'y'), k.replace(/oes$/, 'o'), k.replace(/es$/, ''), k.replace(/s$/, ''), k + 's', k + 'es', k.replace(/y$/, 'ies')])];
  window.catalogEntry = function (name) {
    const k = n(name); if (!k) return null;
    build();
    for (const v of variants(k)) if (byKey.has(v)) return byKey.get(v);
    return null;
  };
  window.catalogPackage = name => { const e = catalogEntry(name); return e?.pkg ? { ...e.pkg } : null };
  window.catalogDepartment = name => catalogEntry(name)?.department || null;
  const start = () => setTimeout(() => window.ensureCatalog(), 200);
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();

// The family's own ingredients, indexed by normalized spelling (and simple plural forms) -> display name.
let familyIndexCache = null, familyIndexAt = 0;
function familyIndex() {
  if (familyIndexCache && Date.now() - familyIndexAt < 4000) return familyIndexCache;
  const display = new Map();
  for (const r of Object.values(state?.data?.recipes || {})) for (const i of r.ingredients || []) if (i?.name && !display.has(ingredientKey(i.name))) display.set(ingredientKey(i.name), String(i.name).trim());
  for (const [k, v] of Object.entries(state?.pantry || {})) if (v?.name && !display.has(k)) display.set(k, v.name);
  const idx = new Map();
  for (const k of allIngredients()) {
    const shown = display.get(k) || catalogEntry(k)?.name && CATALOG_NORM(catalogEntry(k).name) === CATALOG_NORM(k) && catalogEntry(k).name || (k.charAt(0).toUpperCase() + k.slice(1));
    const t = CATALOG_NORM(k);
    for (const v of [t, t.replace(/ies$/, 'y'), t.replace(/es$/, ''), t.replace(/s$/, ''), t + 's', t + 'es']) if (!idx.has(v) || v === t) idx.set(v, shown);
  }
  familyIndexCache = idx; familyIndexAt = Date.now(); return idx;
}
function familyIngredient(name) { const k = CATALOG_NORM(name); return k ? familyIndex().get(k) || null : null }
function familyNames() { return [...new Set(familyIndex().values())] }
(function () { const _save = window.save; if (typeof _save === 'function') window.save = function () { familyIndexCache = null; return _save.apply(this, arguments) } })();
// What a typed name should be saved as: the family's own name, else the built-in name (alternate names included), else null.
function knownIngredient(name) {
  const fam = familyIngredient(name); if (fam) return fam;
  const e = catalogEntry(name); if (!e) return null;
  // the family may already use the built-in name in its own capitalization
  return familyIngredient(e.name) || e.name;
}
function isKnownIngredient(name) { return !!knownIngredient(name) }

// Search the family's ingredients and the built-in list. Returns up to `limit` {k, score, from, via}.
function ingredientPickerMatches(value, limit = 8) {
  const v = CATALOG_NORM(value); if (!v) return [];
  const tol = Math.max(1, Math.floor(v.length * .22)), out = new Map();
  const score = t => t === v ? -1 : t.startsWith(v) ? 0 : (' ' + t).includes(' ' + v) ? 1 : t.includes(v) ? 2 : (v.length > 3 && Math.abs(t.length - v.length) <= tol + 1 && editDistance(v, t) <= tol) ? 3 : 9;
  const add = (k, s, from, via) => { const key = ingredientKey(k), cur = out.get(key); if (s < 9 && (!cur || s < cur.score || (s === cur.score && from === 'family' && cur.from !== 'family'))) out.set(key, { k, score: s, from, via }) };
  for (const k of familyNames()) add(k, score(CATALOG_NORM(k)), 'family');
  for (const e of CATALOG_ENTRIES) {
    let best = score(CATALOG_NORM(e.name)), via = null;
    for (const a of e.aliases) { const s = score(CATALOG_NORM(a)); if (s < 9 && s + .4 < best) { best = s + (s < 0 ? 0 : .4); via = a } }
    const fam = familyIngredient(e.name);
    add(fam || e.name, best, fam ? 'family' : 'catalog', via);
  }
  return [...out.values()].sort((a, b) => a.score - b.score || (a.from === 'family' ? -1 : 0) - (b.from === 'family' ? -1 : 0) || a.k.length - b.k.length || a.k.localeCompare(b.k)).slice(0, limit);
}

// Close spellings for something not on the list ("Did you mean…").
function ingredientDidYouMean(value, limit = 4) {
  const v = CATALOG_NORM(value); if (!v) return [];
  const words = v.split(' ').filter(w => w.length > 2);
  const scored = [];
  const consider = (k, from) => {
    const t = CATALOG_NORM(k);
    let s = editDistance(v, t) / Math.max(v.length, t.length);
    if (words.length) { const tw = t.split(' '), hits = words.filter(w => tw.some(x => x === w || x.replace(/s$/, '') === w.replace(/s$/, '') || (w.length > 4 && editDistance(w, x) <= 1))).length; s -= hits / words.length * .5 }
    scored.push({ k, s, from });
  };
  for (const k of familyNames()) consider(k, 'family');
  for (const e of CATALOG_ENTRIES) { if (!familyIngredient(e.name)) consider(e.name, 'catalog'); for (const a of e.aliases) { const t = CATALOG_NORM(a); const s = editDistance(v, t) / Math.max(v.length, t.length); if (s < .3) scored.push({ k: e.name, s, from: 'catalog' }) } }
  const seen = new Set();
  return scored.filter(x => x.s < .45).sort((a, b) => a.s - b.s).filter(x => !seen.has(ingredientKey(x.k)) && seen.add(ingredientKey(x.k))).slice(0, limit);
}

// Levenshtein distance on already-normalized strings
function editDistance(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j), cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

// ---------- recipe editor picker ----------
function ingredientStatusHTML(idx) {
  const i = window.editingIngredients[idx], name = String(i.name || '').trim();
  if (!name || !catalogReady()) return '';
  const known = knownIngredient(name);
  if (known) return CATALOG_NORM(known) === CATALOG_NORM(name) ? `<div class="ing-ok small">✓ On the ingredient list</div>` : `<div class="ing-ok small">✓ Will be saved as <b>${esc(known)}</b></div>`;
  if (i.newApproved) return `<div class="ing-new small">＋ New ingredient — it'll be added to your list when you save</div>`;
  return `<div class="ing-unknown small">Not on the ingredient list yet. Pick one below, or add it as a new ingredient.</div>`;
}
function updateIngredientSuggestions(idx) {
  const item = window.editingIngredients[idx], target = document.getElementById('ingredient-suggest-' + idx), status = document.getElementById('ingredient-status-' + idx);
  if (!target) return;
  if (!catalogReady()) { ensureCatalog().then(ok => ok && updateIngredientSuggestions(idx)); }
  if (status) status.innerHTML = catalogReady() ? ingredientStatusHTML(idx) : '';
  const v = item.name || '';
  if (!v.trim() || item.existingSelected) { target.innerHTML = ''; return }
  const known = knownIngredient(v);
  let matches = ingredientPickerMatches(v, 6);
  if (!matches.length || (!known && matches[0].score >= 3)) matches = [...matches, ...ingredientDidYouMean(v).map(x => ({ k: x.k, score: 4, from: x.from }))].filter((x, j, a) => a.findIndex(y => ingredientKey(y.k) === ingredientKey(x.k)) === j).slice(0, 6);
  target.innerHTML = matches.map(x => `<button type="button" class="btn secondary ing-pick" onclick="selectExistingIngredient(${idx},decodeURIComponent('${encId(x.k)}'))">${esc(x.k)}${x.via && CATALOG_NORM(x.via).replace(/s$/, '') !== CATALOG_NORM(x.k).replace(/s$/, '') ? ` <span class="muted tiny">(${esc(x.via)})</span>` : ''}${x.from === 'family' ? ' <span class="tiny muted">· yours</span>' : ''}</button>`).join('')
    + (!known && !item.newApproved ? `<button type="button" class="btn ghost ing-add" onclick="approveNewIngredient(${idx})">＋ Add “${esc(v.trim())}” as a new ingredient</button>` : '');
}
async function approveNewIngredient(idx) {
  const i = window.editingIngredients[idx], name = String(i.name || '').trim(); if (!name) return;
  const near = ingredientDidYouMean(name, 1)[0];
  if (near && !await ask(`Add “${name}” as a new ingredient?\n\nIt's not on the list. Close match: “${near.k}”.`, { ok: 'Add as new', cancel: 'Go back' })) return;
  i.newApproved = true; i.existingSelected = false;
  if (!getPackage(name)) i.newPackage = i.newPackage || { qty: '', unit: '', label: '' };
  renderEditIngredients();
}
function selectExistingIngredient(idx, name) {
  const i = window.editingIngredients[idx]; i.name = name; i.existingSelected = true; i.newApproved = false; i.newPackage = null;
  const p = displayPackage(name); if (p) i.container = p.label;
  renderEditIngredients();
}
function showNewIngredientPackage(idx) { approveNewIngredient(idx) }

// Before a recipe is saved: every ingredient must be on the list or deliberately added. Returns false to stop the save.
function resolveRecipeIngredients(rows) {
  const unknown = [];
  if (!catalogReady()) { rows.forEach(i => { const k = familyIngredient(i.name); if (k) i.name = k }); return true }   // list couldn't load (offline first visit): don't block
  rows.forEach((i, idx) => {
    const known = knownIngredient(i.name);
    if (known) i.name = known;
    else if (!i.newApproved) unknown.push(i.name);
  });
  if (!unknown.length) return true;
  window.editingIngredients.forEach(i => { if (unknown.includes(i.name)) i.flagged = true });
  renderEditIngredients();
  const first = document.querySelector('.edit-ing.flagged');
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  alert((unknown.length === 1 ? `“${unknown[0]}” isn't` : unknown.length + ' ingredients aren\'t') + ' on the ingredient list.\n\nPick the right one from the suggestions under each highlighted ingredient, or tap “Add as a new ingredient” if it really is new.');
  return false;
}

// ---------- pantry and rename ----------
function pantryDatalistNames() {
  const out = new Map();
  for (const k of familyNames()) out.set(ingredientKey(k), k);
  for (const e of CATALOG_ENTRIES) if (!out.has(ingredientKey(e.name))) out.set(ingredientKey(e.name), e.name);
  return [...out.values()].sort((a, b) => a.localeCompare(b));
}
// Ask about an unknown typed name. Resolves to the name to use, or null to cancel.
async function confirmIngredientName(name) {
  if (!await ensureCatalog()) return familyIngredient(name) || name;
  const known = knownIngredient(name); if (known) return known;
  const near = ingredientDidYouMean(name, 1)[0];
  if (near) {
    if (await ask(`“${name}” isn't on the ingredient list.\n\nDid you mean “${near.k}”?`, { ok: 'Use “' + near.k + '”', cancel: 'No, other options' })) return near.k;
  }
  return await ask(`Add “${name}” as a new ingredient?`, { ok: 'Add as new', cancel: 'Cancel' }) ? name : null;
}
