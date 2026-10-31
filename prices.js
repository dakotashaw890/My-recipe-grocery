// Live store prices from your Kroger-family store (v25), through the family's Supabase helper.
// state.kroger = {id, name, address}   (the family's store; synced)
// state.itemMeta[k].kroger = {productId, name, size, price, promo, at, store}   (the matched product; synced)
'use strict';

const KROGER_FRESH_DAYS = 7;
async function callHelper(body) {
  if (typeof syncAuth === 'undefined' || !syncAuth || !syncConfigured) throw Object.assign(new Error('Sign in under ⚙️ Family sync to use store prices and nutrition facts.'), { signin: true });
  const fn = String(SYNC_CFG.importFunction || 'recipe-import').trim();
  const r = await fetch(SYNC_URL + '/functions/v1/' + encodeURIComponent(fn), {
    method: 'POST', headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await readJSON(r);
  if (!r.ok) throw Object.assign(new Error(j?.error || (r.status === 404 ? 'The Supabase helper needs updating: paste the new recipe-import.ts into your recipe-imports function and deploy it.' : 'Couldn\'t reach your Supabase helper (' + r.status + ').')), { setup: !!j?.setup || r.status === 404 });
  return j;
}

// "16 oz", "1 lb", "12 ct", "1 gal", "32 fl oz", "2 x 8 oz" -> {qty, unit}
function parseSize(text) {
  const t = String(text || '').toLowerCase().replace(/,/g, '').trim();
  const multi = t.match(/^(\d+)\s*(?:x|ct\s*\/)\s*([\d.]+)\s*([a-z. ]+)$/);
  if (multi) { const one = parseSize(multi[2] + ' ' + multi[3]); return one ? { qty: one.qty * Number(multi[1]), unit: one.unit } : null }
  const m = t.match(/([\d.]+)\s*(fl\.?\s*oz|oz|lbs?|lb|g|kg|ml|l|liters?|gal|gallons?|qt|quarts?|pt|pints?|ct|count|each|ea|pk|pack)\b/);
  if (!m) return null;
  const units = { 'fl oz': 'fl oz', 'fl. oz': 'fl oz', floz: 'fl oz', oz: 'oz', lb: 'lb', lbs: 'lb', g: 'g', kg: 'kg', ml: 'ml', l: 'l', liter: 'l', liters: 'l', gal: 'gallon', gallon: 'gallon', gallons: 'gallon', qt: 'quart', quart: 'quart', quarts: 'quart', pt: 'pint', pint: 'pint', pints: 'pint', ct: 'ea.', count: 'ea.', each: 'ea.', ea: 'ea.', pk: 'ea.', pack: 'ea.' };
  const u = units[m[2].replace(/\s+/g, ' ')] || units[m[2].replace(/\s+/g, '')];
  return u && Number(m[1]) > 0 ? { qty: Number(m[1]), unit: u } : null;
}
// What one of the family's packages costs at the store, from the matched product's price and size.
function krogerPackagePrice(k) {
  const m = state.itemMeta?.[k]?.kroger, p = displayPackage(k);
  if (!m || !(m.price > 0)) return null;
  const each = m.promo > 0 && m.promo < m.price ? m.promo : m.price, size = parseSize(m.size);
  if (!p || !size) return { value: each, exact: false, sale: each < m.price };
  const c = typeof convertAmount === 'function' ? convertAmount(Number(p.qty), p.unit, size.unit, k) : null;
  if (!c || !(c.qty > 0)) return { value: each, exact: false, sale: each < m.price };
  return { value: Math.round(each * c.qty / size.qty * 100) / 100, exact: !c.estimate, sale: each < m.price };
}
function krogerAgeDays(k) { const at = Date.parse(state.itemMeta?.[k]?.kroger?.at || ''); return at ? (Date.now() - at) / 864e5 : Infinity }
// Order of trust: a price you typed > this week's store price > what you last paid > older store price > estimate
function effectivePriceV25(k) {
  const m = state.itemMeta?.[k];
  if (m?.price != null && Number.isFinite(Number(m.price)) && m.priceSource === 'manual') return { value: Number(m.price), source: 'Manual' };
  const kp = krogerPackagePrice(k), store = state.kroger?.name || 'Kroger';
  if (kp && krogerAgeDays(k) <= KROGER_FRESH_DAYS) return { value: kp.value, source: `${store}${kp.sale ? ' sale' : ''}`, live: true };
  if (m?.price != null && Number.isFinite(Number(m.price))) return { value: Number(m.price), source: m.priceSource === 'paid' ? 'Last paid' : m.priceSource === 'auto' ? 'Automatic' : 'Manual' };
  if (kp) return { value: kp.value, source: `${store} (older)` };
  const estimate = budgetEstimate(k);
  return estimate == null ? null : { value: estimate, source: 'Estimate' };
}

// ---------- Choosing the store ----------
function openStorePicker() {
  const cur = state.kroger;
  openModal(`<div class="row between"><h2>Your store</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">Live prices come from Kroger-family stores: Kroger, King Soopers, Ralphs, Fry's, Fred Meyer, Smith's, Harris Teeter, Dillons, QFC, Mariano's, Pick 'n Save and more.</p>
    ${cur ? `<div class="card store-current"><b>${esc(cur.name)}</b><div class="small muted">${esc(cur.address || '')}</div></div>` : ''}
    <label for="storeZip">ZIP code</label><div class="row"><input id="storeZip" inputmode="numeric" maxlength="5" placeholder="e.g. 45202" onkeydown="if(event.key==='Enter')findStores()"><button class="btn" onclick="findStores()">Find stores</button></div>
    <div id="storeList" class="menu-list"></div><div id="storeMsg" class="small muted" role="status"></div>
    ${cur ? `<div class="actions"><button class="btn ghost" onclick="clearStore()">Stop using store prices</button></div>` : ''}`);
}
async function findStores() {
  const zip = document.getElementById('storeZip')?.value.trim(), msg = document.getElementById('storeMsg');
  msg.textContent = 'Looking…';
  try {
    const j = await callHelper({ action: 'kroger-stores', zip });
    const list = document.getElementById('storeList');
    list.innerHTML = (j.stores || []).map(s => `<button class="menu-item" onclick='chooseStore(${JSON.stringify(s).replace(/'/g, '&#39;')})'><span class="menu-icon" aria-hidden="true">🏪</span><span class="menu-text"><b>${esc(s.name)}</b><small>${esc(s.address)}</small></span></button>`).join('');
    msg.textContent = j.stores?.length ? 'Tap your store.' : 'No Kroger-family stores within 25 miles of that ZIP code.';
  } catch (e) { msg.textContent = e.message; msg.className = 'small warning' }
}
function chooseStore(s) {
  state.kroger = { id: String(s.id), name: s.name, address: s.address };
  save(); closeModal(); toast('Prices will come from ' + s.name);
  refreshStorePrices({ all: true });
}
async function clearStore() { if (!await ask('Stop using store prices?\n\nPrices you typed or paid stay.', { ok: 'Stop' })) return; delete state.kroger; save(); closeModal(); renderShopping() }

// ---------- Getting prices ----------
// Ingredients on the shopping list first; "all" adds every ingredient used by a recipe. Stale ones only, 25 per call.
let priceRefresh = null;
function refreshStorePrices({ all = false, keys = null, quiet = false } = {}) {
  if (!state.kroger?.id || priceRefresh) return priceRefresh;
  if (!window.lastShoppingRows) try { renderShopping() } catch (_) {}
  const wanted = keys || [...new Set([...(window.lastShoppingRows || []).map(r => ingredientKey(r.name)), ...(all ? allIngredients().map(ingredientKey) : [])])];
  const todo = wanted.filter(k => krogerAgeDays(k) > 1 || state.itemMeta?.[k]?.kroger?.store !== state.kroger.id).slice(0, 75);
  if (!todo.length) { if (!quiet) toast('Store prices are up to date'); return null }
  priceRefresh = (async () => {
    let got = 0;
    try {
      for (let i = 0; i < todo.length; i += 25) {
        const batch = todo.slice(i, i + 25);
        // a product the family picked before is searched by its own name, so the same item comes back
        const term = k => state.itemMeta?.[k]?.kroger?.name && state.itemMeta[k].kroger.store === state.kroger.id ? state.itemMeta[k].kroger.name : k;
        const j = await callHelper({ action: 'kroger-prices', locationId: state.kroger.id, terms: batch.map(term) });
        state.itemMeta ??= {};
        for (const k of batch) {
          const list = j.results?.[term(k)] || [], prev = state.itemMeta[k]?.kroger;
          const pick = (prev?.productId && list.find(x => x.id === prev.productId)) || (prev?.pinned ? null : list[0]);
          if (!pick) continue;
          state.itemMeta[k] = { ...(state.itemMeta[k] || {}), kroger: { productId: pick.id, name: pick.name, size: pick.size, price: pick.price, promo: pick.promo, image: pick.image, at: j.at, store: state.kroger.id, pinned: prev?.pinned && prev.productId === pick.id } };
          got++;
        }
      }
      save();
      if (!quiet) toast(got ? `Updated ${got} price${got === 1 ? '' : 's'} from ${state.kroger.name}` : 'No matching products found');
    } catch (e) { if (!quiet || e.setup) alert(e.message) }
    finally { priceRefresh = null }
  })();
  return priceRefresh;
}
// keep the list's prices fresh without anyone asking (once a day, when prices are shown)
function maybeAutoRefreshPrices() { if (state.kroger?.id && typeof syncAuth !== 'undefined' && syncAuth) refreshStorePrices({ quiet: true }) }

// ---------- "Is this the right product?" ----------
async function chooseStoreProduct(encoded) {
  const k = decodeURIComponent(encoded);
  if (!state.kroger?.id) return openStorePicker();
  openModal(`<div class="row between"><h2>${esc(k)} at ${esc(state.kroger.name)}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <label for="productSearch">Search the store</label><div class="row"><input id="productSearch" value="${esc(k)}" onkeydown="if(event.key==='Enter')searchStoreProducts('${encId(k)}')"><button class="btn" onclick="searchStoreProducts('${encId(k)}')">Search</button></div>
    <div id="productList" class="menu-list"></div><div id="productMsg" class="small muted" role="status"></div>`);
  searchStoreProducts(encId(k));
}
async function searchStoreProducts(encoded) {
  const k = decodeURIComponent(encoded), term = document.getElementById('productSearch')?.value.trim() || k, msg = document.getElementById('productMsg');
  msg.textContent = 'Searching…';
  try {
    const j = await callHelper({ action: 'kroger-prices', locationId: state.kroger.id, terms: [term] }), list = j.results?.[term] || [];
    window.productChoices = list; window.productAt = j.at;
    const cur = state.itemMeta?.[k]?.kroger?.productId;
    document.getElementById('productList').innerHTML = list.map((x, i) => `<button class="menu-item ${x.id === cur ? 'chosen' : ''}" onclick="pickStoreProduct('${encId(k)}',${i})">${x.image ? `<img class="product-thumb" src="${esc(x.image)}" alt="">` : '<span class="menu-icon">🛒</span>'}<span class="menu-text"><b>${esc(x.name)}</b><small>${esc(x.size)} · $${Number(x.promo > 0 && x.promo < x.price ? x.promo : x.price).toFixed(2)}${x.promo > 0 && x.promo < x.price ? ` <s>$${Number(x.price).toFixed(2)}</s> sale` : ''}</small></span>${x.id === cur ? '<span aria-label="chosen">✓</span>' : ''}</button>`).join('');
    msg.textContent = list.length ? 'Tap the product your family buys.' : 'Nothing found. Try a shorter or different search.';
  } catch (e) { msg.textContent = e.message; msg.className = 'small warning' }
}
function pickStoreProduct(encoded, i) {
  const k = decodeURIComponent(encoded), x = window.productChoices?.[i]; if (!x) return;
  state.itemMeta ??= {};
  state.itemMeta[k] = { ...(state.itemMeta[k] || {}), kroger: { productId: x.id, name: x.name, size: x.size, price: x.price, promo: x.promo, image: x.image, at: window.productAt || new Date().toISOString(), store: state.kroger.id, pinned: true } };
  save(); closeModal(); toast('Using ' + x.name);
}
// a line for the ingredient editor and shopping details
function storePriceHTML(k) {
  if (!state.kroger?.id) return `<div class="store-price small muted">Live prices: <button type="button" class="linkish" onclick="openStorePicker()">choose your Kroger-family store</button></div>`;
  const m = state.itemMeta?.[k]?.kroger, kp = krogerPackagePrice(k);
  if (!m) return `<div class="store-price small muted">No ${esc(state.kroger.name)} price yet. <button type="button" class="linkish" onclick="chooseStoreProduct('${encId(k)}')">Find it at the store</button></div>`;
  return `<div class="store-price small"><b>$${kp.value.toFixed(2)}</b>${kp.sale ? ' <span class="sale">sale</span>' : ''} per package at ${esc(state.kroger.name)} · ${esc(m.name)}${m.size ? ' (' + esc(m.size) + ')' : ''}${kp.exact ? '' : ' · ≈'}
    <button type="button" class="linkish" onclick="chooseStoreProduct('${encId(k)}')">Not right?</button></div>`;
}
