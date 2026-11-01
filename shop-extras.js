// In the store: quick-add things that aren't on the list, and swap an item for something else.
// state.shopExtras[key] = {name, packs, at}            (synced as extra/<key>)
// state.shopSwaps[fromKey] = {from, parts:[[qty|null, unit|null, name]], base:[qty, unit]|null, at}   (synced as swap/<key>)
//   base null = "same amount of the other thing"; otherwise amounts are per base amount of the original.

// ---------- quick add ----------
function openQuickAdd() {
  if (typeof ensureCatalog === 'function') ensureCatalog();
  const onList = new Set((window.lastShoppingRows || []).map(r => ingredientKey(r.name)));
  const recent = [];
  for (const t of [...(state.spending?.trips || [])].reverse()) for (const i of t.items || []) if (i?.name && !onList.has(ingredientKey(i.name)) && !recent.some(n => ingredientKey(n) === ingredientKey(i.name))) recent.push(i.name);
  openModal(`<div class="row between"><h2>＋ Add to the list</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <label for="qaName">Item</label><input id="qaName" autocomplete="off" placeholder="Search: milk, paper towels…" oninput="quickAddSuggest()" onkeydown="if(event.key==='Enter')quickAdd()">
    <div id="qaSuggest" class="ingredient-suggestions"></div>
    <div class="formrow"><div><label for="qaPacks">How many</label><input id="qaPacks" type="number" min="0.25" step="any" value="1" inputmode="decimal"></div><div><label>&nbsp;</label><div id="qaPkg" class="small muted" style="padding-top:12px">package</div></div></div>
    <div class="actions"><button class="btn" onclick="quickAdd()">Add to list</button><button class="btn secondary" onclick="closeModal()">Done</button></div>
    <div id="qaMsg" class="small" role="status"></div>
    ${recent.length ? `<h3 style="margin-top:14px">Bought before</h3><div class="ingredient-suggestions">${recent.slice(0, 10).map(n => `<button class="btn secondary" onclick="quickAddPick(decodeURIComponent('${encId(n)}'),true)">${esc(n)}</button>`).join('')}</div>` : ''}`);
  setTimeout(() => document.getElementById('qaName')?.focus(), 50);
}
function quickAddSuggest() {
  const v = document.getElementById('qaName')?.value || '', box = document.getElementById('qaSuggest'); if (!box) return;
  const m = v.trim() && typeof ingredientPickerMatches === 'function' ? ingredientPickerMatches(v, 6) : [];
  box.innerHTML = m.map(x => `<button class="btn secondary" onclick="quickAddPick(decodeURIComponent('${encId(x.k)}'))">${esc(x.k)}</button>`).join('');
  quickAddPkg();
}
function quickAddPkg() {
  const name = document.getElementById('qaName')?.value || '', el = document.getElementById('qaPkg'); if (!el) return;
  const known = typeof knownIngredient === 'function' ? knownIngredient(name) : name, p = known && getPackage(known);
  el.textContent = p ? (typeof packageText === 'function' ? packageText(p) : p.label) : 'each';
}
function quickAddPick(name, addNow) {
  const el = document.getElementById('qaName'); if (!el) return;
  el.value = name; document.getElementById('qaSuggest').innerHTML = ''; quickAddPkg();
  if (addNow) quickAdd();
}
async function quickAdd() {
  const el = document.getElementById('qaName'), typed = (el?.value || '').trim(), packs = Number(document.getElementById('qaPacks')?.value) || 1;
  if (!typed) return el?.focus();
  const name = typeof confirmIngredientName === 'function' ? await confirmIngredientName(typed) : typed;
  if (!name) return;
  const key = ingredientKey(name);
  state.shopExtras ??= {};
  const cur = state.shopExtras[key];
  state.shopExtras[key] = { name, packs: Math.round(((cur?.packs || 0) + packs) * 100) / 100, at: Date.now() };
  delete state.checks[key];
  save(); renderShopping();
  const msg = document.getElementById('qaMsg'); if (msg) { msg.className = 'small ing-ok'; msg.textContent = `✓ Added ${name}. Add another, or tap Done.` }
  if (el) { el.value = ''; el.focus() } document.getElementById('qaPacks').value = 1; document.getElementById('qaSuggest').innerHTML = ''; quickAddPkg();
}
function removeShopExtra(encoded) {
  const key = decodeURIComponent(encoded); if (!state.shopExtras?.[key]) return;
  delete state.shopExtras[key]; save(); renderShopping(); toast('Removed from the list');
}
// called by renderShopping after pantry amounts are worked out: extras are bought regardless of the pantry
function addExtraRows(rows) {
  const byKey = new Map(rows.map(r => [ingredientKey(r.name), r]));
  for (const [key, x] of Object.entries(state.shopExtras || {})) {
    if (!x?.name) continue;
    const name = shopSwapTarget(x.name), k = ingredientKey(name), pkg = getPackage(name), qty = pkg ? x.packs * pkg.qty : x.packs, row = byKey.get(k);
    if (row && (!pkg || (row.pkg && normUnit(row.pkg.unit) === normUnit(pkg.unit)))) { row.qty += qty; row.originalQty += qty; row.extraKey = key; continue }
    const r = { name, unit: pkg ? pkg.unit : 'ea.', qty, originalQty: qty, pkg, issues: [], sources: ['Added'], pantryPacks: 0, pantryUsed: 0, extraKey: key, ...(k !== key ? { swappedFrom: new Set([x.name]) } : {}) };
    rows.push(r); byKey.set(k, r);
  }
  for (const [key, o] of Object.entries(state.shopOut || {})) {
    if (byKey.has(key)) continue;
    const name = o?.name ? o.name.charAt(0).toUpperCase() + o.name.slice(1) : key, pkg = getPackage(name), qty = pkg ? pkg.qty : 1;
    const r = { name, unit: pkg ? pkg.unit : 'ea.', qty, originalQty: qty, pkg, issues: [], sources: ['Ran out'], pantryPacks: 0, pantryUsed: 0, ranOut: true };
    rows.push(r); byKey.set(key, r);
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

// ---------- swaps ----------
function shopSwapTarget(name) { const s = state.shopSwaps?.[ingredientKey(name)]; return s?.parts?.length === 1 ? s.parts[0][2] : name }
// recipe ingredients -> what to actually buy (swapped items become their replacements)
function applyShopSwaps(ingredients) {
  const swaps = state.shopSwaps || {}; if (!Object.keys(swaps).length) return ingredients;
  const out = [];
  for (const i of ingredients) {
    const sw = swaps[ingredientKey(i.name)];
    if (!sw?.parts?.length) { out.push(i); continue }
    const q = num(i.qty);
    let factor = null;
    if (sw.base && q != null) { const [bq, bu] = sw.base; if (normUnit(i.unit || 'ea.') === normUnit(bu)) factor = q / bq; else { const c = typeof convertAmount === 'function' ? convertAmount(q, i.unit, bu, i.name) : null; if (c) factor = c.qty / bq } }
    for (const [pq, pu, pn] of sw.parts) {
      if (sw.base && factor != null) out.push({ name: pn, qty: Math.round(pq * factor * 1000) / 1000, unit: pu, swappedFrom: i.name });
      else out.push({ ...i, name: pn, swappedFrom: i.name });   // same amount of the other thing
    }
  }
  return out;
}
function openShopSwap(encoded) {
  const key = decodeURIComponent(encoded), row = (window.lastShoppingRows || []).find(r => ingredientKey(r.name) === key);
  // a row that is already a swap: offer to undo it
  const fromKeys = row?.swappedFrom ? [...row.swappedFrom].map(ingredientKey) : [];
  const name = row?.name || key, sw = typeof swapsFor === 'function' ? swapsFor(name) : null;
  if (typeof ensureCatalog === 'function') ensureCatalog();
  window.shopSwapFor = name;
  openModal(`<div class="row between"><h2>Swap ${esc(name)}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    ${fromKeys.length ? `<div class="card"><b>On the list instead of ${esc([...row.swappedFrom].join(', '))}</b><div class="actions"><button class="btn secondary" onclick="undoShopSwap(decodeURIComponent('${encId(fromKeys.join('|'))}'))">↩ Undo swap</button></div></div>` : ''}
    <p class="small muted">Out of stock or a better deal? The swap changes this shopping list only, until you finish the trip. Your recipes stay the same.</p>
    ${sw?.options?.length ? `<h3>Good swaps</h3><div class="swap-list">${sw.options.map((o, n) => `<div class="swap"><b>${esc(swapPartsText(o.parts, null))}</b> <span class="small muted">for every ${swapAmount(sw.for[0])} ${esc(sw.for[1])}${o.note ? ' · ' + esc(o.note) : ''}</span><div class="actions"><button class="btn secondary" onclick="chooseShopSwap(${n})">Use this</button></div></div>`).join('')}</div>` : ''}
    <h3>${sw?.options?.length ? 'Or pick anything' : 'Pick what to buy instead'}</h3>
    <input id="swapName" autocomplete="off" placeholder="Search ingredients" oninput="shopSwapSuggest()">
    <div id="swapSuggest" class="ingredient-suggestions"></div>
    <p class="tiny muted">The same amount is bought; check the package size on the list.</p>`);
}
function shopSwapSuggest() {
  const v = document.getElementById('swapName')?.value || '', box = document.getElementById('swapSuggest'); if (!box) return;
  const m = v.trim() ? ingredientPickerMatches(v, 6).filter(x => ingredientKey(x.k) !== ingredientKey(window.shopSwapFor)) : [];
  box.innerHTML = m.map(x => `<button class="btn secondary" onclick="chooseShopSwap(null,decodeURIComponent('${encId(x.k)}'))">${esc(x.k)}</button>`).join('')
    + (v.trim() && !(typeof isKnownIngredient === 'function' && isKnownIngredient(v)) ? `<button class="btn ghost ing-add" onclick="chooseShopSwap(null,null,true)">＋ Use “${esc(v.trim())}”</button>` : '');
}
async function chooseShopSwap(n, pick, typed) {
  const from = window.shopSwapFor; if (!from) return;
  let entry;
  if (n != null) { const sw = swapsFor(from), o = sw.options[n]; entry = { from, base: sw.for, parts: o.parts.map(([q, u, nm]) => [q, u, swapPartName(nm)]) } }
  else {
    let to = pick;
    if (typed) { to = await confirmIngredientName(document.getElementById('swapName').value.trim()); if (!to) return }
    entry = { from, base: null, parts: [[null, null, to]] };
  }
  const fromKey = ingredientKey(from);
  state.shopSwaps ??= {}; state.shopSwaps[fromKey] = { ...entry, at: Date.now() };
  // a quick-added item just changes name (the swap still covers recipes that use it)
  if (state.shopExtras?.[fromKey] && entry.parts.length === 1) { const x = state.shopExtras[fromKey]; delete state.shopExtras[fromKey]; const k = ingredientKey(entry.parts[0][2]); state.shopExtras[k] = { ...x, name: entry.parts[0][2] } }
  delete state.checks[fromKey];
  save(); closeModal(); renderShopping();
  toast('⇄ ' + from + ' → ' + entry.parts.map(p => p[2]).join(' + '));
}
function undoShopSwap(keys) {
  for (const k of String(keys).split('|')) delete state.shopSwaps?.[k];
  save(); closeModal(); renderShopping(); toast('Swap undone');
}
// a finished trip: bought quick-adds and swaps are done
function clearShopExtrasAfterTrip(boughtKeys) {
  const bought = new Set(boughtKeys);
  for (const k of Object.keys(state.shopExtras || {})) if (bought.has(ingredientKey(shopSwapTarget(state.shopExtras[k].name)))) delete state.shopExtras[k];
  for (const [k, s] of Object.entries(state.shopSwaps || {})) if ((s.parts || []).some(p => bought.has(ingredientKey(p[2])))) delete state.shopSwaps[k];
  state.shopSkips = {};   // "not needed" was for this trip only
  for (const k of Object.keys(state.shopOut || {})) if (bought.has(k)) delete state.shopOut[k];
}
function shopRowExtrasHTML(row) {
  const id = encId(ingredientKey(row.name));
  return `${row.swappedFrom ? `<span class="swap-badge">⇄ instead of ${esc([...row.swappedFrom].join(', '))}</span>` : ''}${row.extraKey && row.sources?.length === 1 && row.sources[0] === 'Added' ? '<span class="added-badge">＋ Added</span>' : ''}`;
}
function shopRowActionsHTML(row) {
  const id = encId(ingredientKey(row.name));
  return `<button class="btn secondary" onclick="openShopSwap('${id}')">⇄ Swap</button>${row.skipped ? `<button class="btn secondary" onclick="skipShopItem('${id}',false)">↩ Need it after all</button>` : `<button class="btn secondary" onclick="skipShopItem('${id}',true)">✕ Don't need</button>`}${row.onHand ? `<button class="btn secondary" onclick="setOnHand('${id}',false)">Always put it on the list</button>` : state.shopOut?.[ingredientKey(row.name)] ? `<button class="btn secondary" onclick="delete state.shopOut[decodeURIComponent('${id}')];save();renderShopping()">↩ Not out after all</button>` : !alwaysOnHand(ingredientKey(row.name)) && !['Produce', 'Meat & Seafood'].includes(departmentFor(row.name)) ? `<button class="btn secondary" onclick="setOnHand('${id}',true)">🧂 I always have this</button>` : ''}${row.extraKey ? `<button class="btn secondary" onclick="removeShopExtra('${encId(row.extraKey)}')">${row.uses?.length ? 'Remove what I added' : 'Remove'}</button>` : ''}</div>${shopUsesHTML(row)}<div>`;
}

// ---------- which recipes need it ----------
function shopForHTML(row) {
  const names = [...new Set((row.uses || []).map(u => recipeName(u.rid)).filter(Boolean))];
  const extra = [...(row.extraKey ? ['added by hand'] : []), ...(row.staple ? ['staple'] : []), ...(state.shopOut?.[ingredientKey(row.name)] ? ['ran out'] : [])];
  const all = [...names, ...extra]; if (!all.length) return '';
  return `<span class="shop-for">For ${esc(all.slice(0, 2).join(', '))}${all.length > 2 ? ` +${all.length - 2} more` : ''}</span>`;
}
function shopUsesHTML(row) {
  const uses = row.uses || []; if (!uses.length) return '';
  const by = new Map();
  for (const u of uses) { const k = u.rid + '|' + normUnit(u.unit) + '|' + (u.from || ''); const cur = by.get(k); if (cur && cur.qty != null && u.qty != null) cur.qty += u.qty; else if (!cur) by.set(k, { ...u }) }
  return `<b class="small">Needed for</b><ul class="shop-uses">${[...by.values()].map(u => `<li><a href="#" onclick="event.preventDefault();openRecipe(decodeURIComponent('${encId(u.rid)}'))">${esc(recipeName(u.rid))}</a> · ${u.qty != null ? fmt(Math.round(u.qty * 100) / 100) + ' ' + esc(u.unit) : 'some'}${u.from ? ` <span class="muted">(instead of ${esc(u.from)})</span>` : ''}</li>`).join('')}</ul>`;
}

// ---------- don't need it this trip ----------
function skipShopItem(encoded, on) {
  const key = decodeURIComponent(encoded); state.shopSkips ??= {};
  if (on) { state.shopSkips[key] = { at: Date.now() }; delete state.checks[key] } else delete state.shopSkips[key];
  save(); renderShopping(); toast(on ? 'Moved to "Not needed this trip"' : 'Back on the list');
}

// ---------- things you almost always have (seasonings, oils, condiments, toppings) ----------
// Not tracked in the pantry? Then they go in a folded "Check you have" section instead of the list,
// until someone taps "I'm out". itemMeta[key].onHand: true = always assume, false = never assume.
const ON_HAND_DEFAULTS = new Set(["olive oil", "extra virgin olive oil", "vegetable oil", "canola oil", "coconut oil", "avocado oil", "sesame oil", "peanut oil", "cooking spray", "white vinegar", "apple cider vinegar", "red wine vinegar", "white wine vinegar", "balsamic vinegar", "rice vinegar", "ketchup", "yellow mustard", "dijon mustard", "spicy brown mustard", "whole grain mustard", "honey mustard", "mayonnaise", "miracle whip", "relish", "hot sauce", "sriracha", "buffalo sauce", "bbq sauce", "worcestershire sauce", "soy sauce", "tamari", "teriyaki sauce", "hoisin sauce", "oyster sauce", "fish sauce", "sweet chili sauce", "chili garlic sauce", "gochujang", "curry paste", "ranch dressing", "ranch seasoning mix", "italian dressing", "caesar dressing", "balsamic vinaigrette", "blue cheese dressing", "thousand island dressing", "honey mustard dressing", "french dressing", "poppy seed dressing", "steak sauce", "cocktail sauce", "tartar sauce", "horseradish", "liquid smoke", "tahini", "salt", "kosher salt", "sea salt", "seasoned salt", "garlic salt", "celery salt", "black pepper", "whole black peppercorns", "white pepper", "garlic powder", "onion powder", "minced garlic", "minced onion", "paprika", "smoked paprika", "chili powder", "cayenne pepper", "red pepper flakes", "chipotle chili powder", "ground cumin", "cumin seeds", "ground coriander", "turmeric", "curry powder", "garam masala", "ground ginger", "ground cinnamon", "cinnamon sticks", "ground nutmeg", "ground cloves", "ground allspice", "pumpkin pie spice", "apple pie spice", "ground cardamom", "dried oregano", "dried basil", "dried thyme", "dried rosemary", "dried parsley", "dried dill", "rubbed sage", "dried marjoram", "dried tarragon", "bay leaves", "italian seasoning", "herbes de provence", "poultry seasoning", "cajun seasoning", "old bay seasoning", "lemon pepper", "steak seasoning", "taco seasoning", "fajita seasoning", "chili seasoning mix", "sazon seasoning", "adobo seasoning", "everything bagel seasoning", "greek seasoning", "jerk seasoning", "chinese five spice", "za'atar", "sesame seeds", "poppy seeds", "celery seed", "mustard seed", "ground mustard", "fennel seed", "saffron", "msg", "gravy mix", "country gravy mix", "turkey gravy mix", "lemon juice", "lime juice", "all-purpose flour", "granulated sugar", "brown sugar", "powdered sugar", "baking soda", "baking powder", "cornstarch", "cream of tartar", "vanilla extract", "almond extract", "honey", "maple syrup", "vegetable shortening", "cocoa powder", "chicken bouillon", "beef bouillon", "breadcrumbs", "italian breadcrumbs", "panko", "active dry yeast", "instant yeast", "sesame seeds"]);
function onHandByDefault(key) {
  if (ON_HAND_DEFAULTS.has(key)) return true;
  const e = typeof catalogEntry === 'function' ? catalogEntry(key) : null;
  return !!e && ON_HAND_DEFAULTS.has(e.name.toLowerCase());
}
function onHandSetting(key) { const v = state.itemMeta?.[key]?.onHand; return v === true || v === false ? v : null }
function alwaysOnHand(key) { const s = onHandSetting(key); return s != null ? s : onHandByDefault(key) }
function assumedOnHand(row) {
  const key = ingredientKey(row.name);
  if (state.pantry?.[key] || state.shopOut?.[key] || row.extraKey || row.staple) return false;   // tracked, out, or asked for
  const s = onHandSetting(key);
  if (s === false) return false;
  if (s === true || onHandByDefault(key)) return 'always';
  // a little of something long-lasting: this week's recipes use under a tenth of one package
  const dept = departmentFor(row.name), issues = row.issues || [];
  if (row.pkg && row.originalQty > 0 && row.originalQty < row.pkg.qty * 0.1 && !['Produce', 'Meat & Seafood', 'Bakery', 'Frozen'].includes(dept) && !issues.some(t => /^(Conversion needed|Cannot|Check recipe)/.test(t))) return 'small';
  return false;
}
function markOut(encoded, quiet) {
  const key = decodeURIComponent(encoded); state.shopOut ??= {};
  state.shopOut[key] = { at: Date.now(), name: state.shopOut[key]?.name || (window.lastShoppingRows || []).find(r => ingredientKey(r.name) === key)?.name || key };
  delete state.shopSkips?.[key];
  save(); if (document.getElementById('shopping')?.classList.contains('active')) renderShopping();
  if (!quiet) toast('🛒 On the list');
}
function setOnHand(encoded, on) {
  const key = decodeURIComponent(encoded); state.itemMeta ??= {};
  const m = state.itemMeta[key] = { ...(state.itemMeta[key] || {}) };
  if (on === null || on === onHandByDefault(key)) delete m.onHand; else m.onHand = on;
  if (on === false && state.shopOut?.[key]) delete state.shopOut[key];
  save(); if (document.getElementById('shopping')?.classList.contains('active')) renderShopping();
  toast(on ? 'Got it: you always have ' + key : 'It will go on the list whenever a recipe needs it');
}
function onHandEditorHTML(key) {
  const on = alwaysOnHand(key), id = encId(key);
  return `<label class="check-line onhand-line"><input type="checkbox" ${on ? 'checked' : ''} onchange="setOnHand('${id}',this.checked)"> 🧂 I almost always have this <span class="small muted">— keep it under "Check you have" instead of on the list (unless you track it in the pantry)</span></label>`;
}
// "Out of something?" from a recipe or cook mode
function openOutOf(rid) {
  const r = state.data.recipes[rid]; if (!r) return;
  const names = [...new Set((r.ingredients || []).map(i => i.name).filter(n => !/^(tap |cold |warm |hot |boiling |ice )?water$/i.test(n)))];
  openModal(`<div class="row between"><h2>Out of something?</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">Tick what you've run out of. It goes on the shopping list.</p>
    <div class="out-list">${names.map((n, i) => `<label class="check-line"><input type="checkbox" class="outPick" value="${esc(ingredientKey(n))}" data-name="${esc(n)}" ${state.shopOut?.[ingredientKey(n)] ? 'checked disabled' : ''}> ${esc(n)}${state.shopOut?.[ingredientKey(n)] ? ' <span class="small muted">· already on the list</span>' : ''}</label>`).join('')}</div>
    <div class="actions"><button class="btn" onclick="saveOutOf()">Add to shopping list</button><button class="btn secondary" onclick="closeModal()">Cancel</button></div>`);
}
function saveOutOf() {
  const picks = [...document.querySelectorAll('.outPick:checked:not(:disabled)')];
  if (!picks.length) return closeModal();
  state.shopOut ??= {};
  for (const p of picks) state.shopOut[p.value] = { at: Date.now(), name: p.dataset.name };
  save(); closeModal(); toast('🛒 ' + picks.length + ' item' + (picks.length === 1 ? '' : 's') + ' added to the shopping list');
}
