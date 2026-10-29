// Shopping together (v22): live updates while the list is open, who checked what,
// and sorting the list in the order of the store's aisles, learned from past trips.
'use strict';

// ---------- Checks remember who and when ----------
function checkInfo(key) { const c = state.checks?.[key]; return c && typeof c === 'object' ? c : (c ? { at: 0 } : null) }
function myName() { return (typeof syncInfo !== 'undefined' && syncInfo?.displayName) || '' }
function setChecked(key, on) {
  state.checks ??= {};
  if (on) state.checks[key] = { by: myName(), at: Date.now() };
  else delete state.checks[key];
}
function checkedByHTML(key) {
  const c = checkInfo(key);
  if (!c?.by || !(typeof syncActive === 'function' && syncActive())) return '';
  return `<span class="checked-by">✓ ${esc(c.by === myName() ? 'You' : c.by)}</span>`;
}

// ---------- Live while shopping ----------
// While the shopping list is on screen, check with the family every few seconds (instead of every 15),
// and send a tick right away.
const LIVE_MS = 3000;
let liveTimer = null;
function shoppingVisible() { return document.visibilityState === 'visible' && document.getElementById('shopping')?.classList.contains('active') }
function liveTick() {
  if (!shoppingVisible() || typeof syncActive !== 'function' || !syncActive()) return;
  if (!syncRunning) runSync();
}
liveTimer = setInterval(liveTick, LIVE_MS);
function liveBadgeHTML() {
  if (typeof syncActive !== 'function' || !syncActive()) return '';
  const ok = syncStatus?.state === 'ok' || syncStatus?.state === 'syncing';
  return `<span class="live-badge ${ok ? 'on' : ''}">${ok ? '● Live with your family' : '○ Offline: changes will sync later'}</span>`;
}

// ---------- Store aisle order ----------
// state.stores['walmart'] = {name: 'Walmart', items: {'eggs': 0.82, ...}, trips: 3}
// Each position is where in the trip (0 = first, 1 = last) the item was checked off, averaged over trips.
function storeKey(name) { return String(name || '').toLowerCase().trim().replace(/\s+/g, ' ') }
function learnStoreOrder(storeName, keys) {
  const checks = keys.map(k => ({ k, at: checkInfo(k)?.at || 0 })).filter(x => x.at > 0).sort((a, b) => a.at - b.at);
  if (checks.length < 3) return;   // too few to say anything about the layout
  const sk = storeKey(storeName); if (!sk) return;
  state.stores ??= {};
  const st = { name: storeName, trips: 0, items: {}, ...(state.stores[sk] || {}) };
  st.items = { ...st.items };
  checks.forEach((x, i) => {
    const pos = i / (checks.length - 1), old = st.items[x.k];
    st.items[x.k] = Math.round((old == null ? pos : old * 0.6 + pos * 0.4) * 1000) / 1000;   // newer trips count more
  });
  st.trips = (st.trips || 0) + 1; st.name = storeName;
  state.stores[sk] = st;
}
function storeList() { return Object.entries(state.stores || {}).filter(([, s]) => s?.items && Object.keys(s.items).length).map(([k, s]) => ({ key: k, ...s })) }
function shopSortMode() { try { const v = localStorage.getItem('gingham-shop-sort') || ''; return v && state.stores?.[v] ? v : '' } catch (_) { return '' } }
function setShopSort(v) { try { localStorage.setItem('gingham-shop-sort', v) } catch (_) {} renderShopping() }
function shopSortBarHTML() {
  const stores = storeList(), cur = shopSortMode();
  return `<div class="shop-sort"><label for="shopSort">Sort</label><select id="shopSort" onchange="setShopSort(this.value)">
    <option value="">By department</option>${stores.map(s => `<option value="${esc(s.key)}" ${s.key === cur ? 'selected' : ''}>${esc(s.name)} aisle order</option>`).join('')}</select>
    ${stores.length ? '' : '<span class="tiny muted">Aisle order is learned from the order you check things off. Finish a trip and pick the store.</span>'}</div>`;
}
// order departments by where their items usually are in this store; unknowns keep the usual order after them
function shopDeptOrder(defaultOrder, groups) {
  const sk = shopSortMode(); if (!sk) return defaultOrder;
  const items = state.stores[sk].items;
  const rank = d => { const pos = (groups[d] || []).map(x => items[ingredientKey(x.name)]).filter(v => v != null).sort((a, b) => a - b); return pos.length ? pos[Math.floor(pos.length / 2)] : 2 + defaultOrder.indexOf(d) / 100 };
  const pantry = defaultOrder.filter(d => d === 'Covered by Pantry');
  return defaultOrder.filter(d => d !== 'Covered by Pantry').sort((a, b) => rank(a) - rank(b)).concat(pantry);
}
function shopSort(list) {
  const sk = shopSortMode(); if (!sk) return list;
  const items = state.stores[sk].items, p = x => items[ingredientKey(x.name)] ?? 9;
  return list.slice().sort((a, b) => p(a) - p(b) || a.name.localeCompare(b.name));
}
