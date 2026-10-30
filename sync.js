// Family sync through Supabase, using its standard REST and Auth web APIs (no extra library).
//
// The app's data is split into small entries (one per recipe, plan slot, pantry item, checked
// item, photo, ...). Each phone sends only the entries that changed since its last sync and
// receives everyone else's. If two people change the same entry, the later change wins.
// Device-only things (undo history, settings for this phone) are never sent.
'use strict';

const SYNC_CFG = window.RG_SYNC_CONFIG || {};
const SYNC_URL = String(SYNC_CFG.url || '').trim().replace(/\/+$/, '');
const SYNC_KEY_ANON = String(SYNC_CFG.anonKey || '').trim();
const syncConfigured = /^https:\/\/[^/]+/.test(SYNC_URL) && SYNC_KEY_ANON.length > 20;
const AUTH_STORE = KEY + '-auth', SYNC_STORE = KEY + '-sync';
const PULL_OVERLAP_MS = 5000, STARTUP_OVERLAP_MS = 10 * 60 * 1000, POLL_MS = 15000, PAGE = 500;

function readStore(k) { try { return JSON.parse(localStorage.getItem(k)) } catch (_) { return null } }
function writeStore(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch (e) { console.error('Could not save sync info', e) } }

let syncAuth = readStore(AUTH_STORE);   // {access_token, refresh_token, expires_at, user:{id,email}}
let syncInfo = readStore(SYNC_STORE);   // {familyId, familyName, joinCode, displayName, cursor, hashes, lastSyncAt, paused}
let syncStatus = { state: 'idle', message: '' };

class SyncError extends Error { constructor(msg, status) { super(msg); this.status = status } }
function syncActive() { return syncConfigured && !!syncAuth && !!syncInfo?.familyId }
function persistSync() { writeStore(SYNC_STORE, syncInfo) }

// ---------- Talking to Supabase ----------
function errorText(j, fallback) { return (j && (j.error_description || j.msg || j.message || (typeof j.error === 'string' && j.error))) || fallback }
async function readJSON(r) { const t = await r.text(); try { return t ? JSON.parse(t) : null } catch (_) { return null } }

async function authCall(path, body, token) {
  const r = await fetch(SYNC_URL + '/auth/v1/' + path, {
    method: 'POST',
    headers: { apikey: SYNC_KEY_ANON, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {})
  });
  const j = await readJSON(r);
  if (!r.ok) throw new SyncError(errorText(j, 'Sign-in problem (' + r.status + ')'), r.status);
  return j;
}
function keepSession(j) {
  if (!j?.access_token) return false;
  syncAuth = {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000,
    user: { id: j.user?.id, email: j.user?.email }
  };
  writeStore(AUTH_STORE, syncAuth);
  return true;
}
let refreshing = null;
function refreshSession() {
  refreshing ??= (async () => {
    try { keepSession(await authCall('token?grant_type=refresh_token', { refresh_token: syncAuth?.refresh_token })) }
    catch (e) {
      // A rejected refresh token means this phone must sign in again; network errors don't.
      if (e.status === 400 || e.status === 401 || e.status === 403) { syncAuth = null; writeStore(AUTH_STORE, null); setSyncStatus('signedout', 'Signed out. Sign in again to keep syncing.') }
      throw e;
    } finally { refreshing = null }
  })();
  return refreshing;
}
async function accessToken() {
  if (!syncAuth) throw new SyncError('Not signed in', 401);
  if (Date.now() > syncAuth.expires_at - 60000) await refreshSession();
  return syncAuth.access_token;
}
async function rest(method, path, body, prefer, retried) {
  const r = await fetch(SYNC_URL + '/rest/v1/' + path, {
    method,
    headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body == null ? undefined : JSON.stringify(body)
  });
  if (r.status === 401 && !retried) { await refreshSession(); return rest(method, path, body, prefer, true) }
  const j = await readJSON(r);
  if (!r.ok) throw new SyncError(errorText(j, 'Server error ' + r.status), r.status);
  return j;
}
const rpc = (fn, args) => rest('POST', 'rpc/' + fn, args);

// ---------- Splitting the app's data into entries ----------
const SYNC_MAPS = [
  ['recipe/', s => s.data?.recipes, s => (s.data.recipes ??= {})],
  ['ingredient/', s => s.data?.ingredients, s => (s.data.ingredients ??= {})],
  ['plan/', s => s.plan, s => (s.plan ??= {})],
  ['check/', s => s.checks, s => (s.checks ??= {})],
  ['selected/', s => s.selected, s => (s.selected ??= {})],
  ['pantry/', s => s.pantry, s => (s.pantry ??= {})],
  ['pkg/', s => s.packagePrefs, s => (s.packagePrefs ??= {})],
  ['meta/', s => s.itemMeta, s => (s.itemMeta ??= {})],
  ['conv/', s => s.ingredientConversions, s => (s.ingredientConversions ??= {})],
  ['barcode/', s => s.barcodeLinks, s => (s.barcodeLinks ??= {})],
  ['group/', s => s.recipeGroups, s => (s.recipeGroups ??= {})],
  ['person/', s => s.people, s => (s.people ??= {})],
  ['rating/', s => s.ratings, s => (s.ratings ??= {})],
  ['store/', s => s.stores, s => (s.stores ??= {})],
];
function hashText(str) {   // cyrb53
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Photos never change once saved (a new picture gets a new id), so the id is their hash.
// 'p2' = the photo itself is in Supabase Storage and the entry is just a marker; 'p' = the old way, photo inside the entry.
function entryHash(key, value) { return key.startsWith('photo/') ? (isPhotoMark(value) ? 'p2' : 'p') : hashText(JSON.stringify(value)) }

// ---------- Photos live in Supabase Storage (v23) ----------
// The shared data only says "photo X exists"; the picture is a file at photos/<family id>/<photo id>.
// Each phone keeps its own copy (IndexedDB), downloading new ones in the background.
// Until the storage setup script has been run, photos keep travelling inside the shared data as before.
const PHOTO_BUCKET = 'photos', PHOTO_MARK = Object.freeze({ stored: 1 });
function isPhotoMark(v) { return !!v && typeof v === 'object' && v.stored === 1 }
let photoStorage = 'unknown';   // 'ok' | 'missing' (setup not run) — checked again each time the app opens
const PENDING_STORE = KEY + '-photoPending';
const pendingPhotos = new Set(readStore(PENDING_STORE) || []);
function savePending() { writeStore(PENDING_STORE, [...pendingPhotos]) }
function photoPath(id) { return `${syncInfo.familyId}/${id}` }
async function storageCall(method, path, { body, headers = {}, raw = false } = {}, retried) {
  const r = await fetch(SYNC_URL + '/storage/v1/' + path, {
    method, body, headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + await accessToken(), ...headers }
  });
  if (r.status === 401 && !retried) { await refreshSession(); return storageCall(method, path, { body, headers, raw }, true) }
  if (raw && r.ok) return r;
  const j = await readJSON(r);
  if (!r.ok) {
    const msg = errorText(j, 'Photo storage error ' + r.status);
    const e = new SyncError(msg, r.status); e.missingBucket = /bucket not found/i.test(msg) || /bucket not found/i.test(j?.error || ''); e.notFound = String(j?.statusCode) === '404' || r.status === 404;
    throw e;
  }
  return j;
}
async function storedPhotoIds() {
  const ids = new Set();
  for (let offset = 0; ; offset += 1000) {
    const list = await storageCall('POST', `object/list/${PHOTO_BUCKET}`, { body: JSON.stringify({ prefix: syncInfo.familyId + '/', limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }), headers: { 'Content-Type': 'application/json' } });
    for (const o of list || []) if (o?.name) ids.add(o.name);
    if (!list || list.length < 1000) return ids;
  }
}
function dataUrlToBlob(url) {
  const [head, b64] = String(url).split(','), type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64 || ''), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
function blobToDataUrl(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob) }) }
// Upload photos this phone has that the family's storage doesn't. Returns false when storage isn't set up yet.
async function uploadPhotos(ids) {
  if (!ids.length) return true;
  let have;
  try { have = await storedPhotoIds() }
  catch (e) { if (e.missingBucket) { photoStorage = 'missing'; return false } throw e }
  photoStorage = 'ok';
  const todo = ids.filter(id => !have.has(id) && photoCache[id]);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const id = todo[next++], blob = dataUrlToBlob(photoCache[id]);
      await storageCall('POST', `object/${PHOTO_BUCKET}/${photoPath(id)}`, { body: blob, headers: { 'Content-Type': blob.type, 'x-upsert': 'true', 'cache-control': '31536000' } });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return true;
}
async function deleteStoredPhotos(ids) {
  if (!ids.length || photoStorage === 'missing') return;
  try { await storageCall('DELETE', `object/${PHOTO_BUCKET}`, { body: JSON.stringify({ prefixes: ids.map(photoPath) }), headers: { 'Content-Type': 'application/json' } }) } catch (e) { console.warn('Photo cleanup skipped', e.message) }
}
// Fetch photos the family has that this phone doesn't yet, a few at a time, without holding up sync.
let downloading = null;
function downloadPendingPhotos() {
  if (downloading || !pendingPhotos.size || !syncActive()) return downloading;
  downloading = (async () => {
    let got = 0;
    const ids = [...pendingPhotos]; let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        if (photoCache[id]) { pendingPhotos.delete(id); continue }
        try {
          const r = await storageCall('GET', `object/authenticated/${PHOTO_BUCKET}/${photoPath(id)}`, { raw: true });
          await storePhoto(await blobToDataUrl(await r.blob()), id);
          pendingPhotos.delete(id); got++;
        } catch (e) { if (!e.notFound && !e.missingBucket) console.warn('Photo download will retry', e.message) }   // not uploaded yet: try again next sync
      }
    };
    try { await Promise.all([worker(), worker(), worker()]) } finally {
      savePending(); downloading = null;
      if (got) showRemoteChanges();
    }
  })();
  return downloading;
}

function localEntries(s, photos) {
  const out = new Map(), put = (k, v) => { if (v !== undefined) out.set(k, v) };
  for (const [prefix, get] of SYNC_MAPS) for (const [k, v] of Object.entries(get(s) || {})) put(prefix + k, v);
  for (const n of s.favorites || []) put('fav/' + n, true);
  for (const n of s.deletedIngredients || []) put('deleted-ingredient/' + n, true);
  for (const t of s.spending?.trips || []) if (t?.id != null) put('trip/' + t.id, t);
  if (s.spending?.budget != null) put('setting/budget', s.spending.budget);
  if (s.planPrefs && Object.keys(s.planPrefs).length) put('setting/planPrefs', s.planPrefs);
  for (const [id, url] of Object.entries(photos || {})) put('photo/' + id, photoStorage === 'missing' ? url : PHOTO_MARK);
  // photos the family has that are still downloading count as present, so they're never "removed"
  if (photos === photoCache) for (const id of pendingPhotos) if (!photos[id]) put('photo/' + id, PHOTO_MARK);
  return out;
}
function splitKey(key) { const i = key.indexOf('/'); return [key.slice(0, i + 1), key.slice(i + 1)] }
function setEntry(s, photos, key, value) {
  const [prefix, k] = splitKey(key), map = SYNC_MAPS.find(m => m[0] === prefix);
  if (map) { map[2](s)[k] = value; return true }
  if (prefix === 'fav/') { s.favorites ??= []; if (!s.favorites.includes(k)) s.favorites.push(k); return true }
  if (prefix === 'deleted-ingredient/') { s.deletedIngredients ??= []; if (!s.deletedIngredients.includes(k)) s.deletedIngredients.push(k); return true }
  if (prefix === 'trip/') { s.spending ??= { trips: [], budget: 0 }; s.spending.trips ??= []; const i = s.spending.trips.findIndex(t => String(t.id) === k); i >= 0 ? s.spending.trips[i] = value : s.spending.trips.push(value); return true }
  if (key === 'setting/budget') { s.spending ??= { trips: [], budget: 0 }; s.spending.budget = value; return true }
  if (key === 'setting/planPrefs') { s.planPrefs = value || {}; return true }
  if (prefix === 'photo/') { if (isPhotoMark(value)) { if (!photos[k]) { pendingPhotos.add(k); savePending() } } else photos[k] = value; return true }
  return false;   // a kind of data from a newer version of the app: leave it alone
}
function removeEntry(s, photos, key) {
  const [prefix, k] = splitKey(key), map = SYNC_MAPS.find(m => m[0] === prefix);
  if (map) { const obj = map[1](s); if (obj) delete obj[k]; return }
  if (prefix === 'fav/') { s.favorites = (s.favorites || []).filter(x => x !== k); return }
  if (prefix === 'deleted-ingredient/') { s.deletedIngredients = (s.deletedIngredients || []).filter(x => x !== k); return }
  if (prefix === 'trip/') { if (s.spending?.trips) s.spending.trips = s.spending.trips.filter(t => String(t.id) !== k); return }
  if (key === 'setting/budget') { if (s.spending) s.spending.budget = 0; return }
  if (key === 'setting/planPrefs') { s.planPrefs = {}; return }
  if (prefix === 'photo/') { delete photos[k]; if (pendingPhotos.delete(k)) savePending(); return }
}
function clearSharedData(s) {
  s.data ??= {}; s.data.recipes = {}; s.data.ingredients = {};
  for (const [, , ensure] of SYNC_MAPS) { const obj = ensure(s); for (const k of Object.keys(obj)) delete obj[k] }
  s.favorites = []; s.deletedIngredients = []; s.spending = { trips: [], budget: 0 }; s.pantryHistory = [];
}

// ---------- Sending and receiving ----------
async function pushChanges() {
  const local = localEntries(state, photoCache), hashes = syncInfo.hashes ||= {}, rows = [];
  for (const [key, value] of local) { const h = entryHash(key, value); if (hashes[key] !== h) rows.push({ key, value, deleted: false, h }) }
  const removed = Object.keys(hashes).filter(k => !local.has(k));
  const idUpgrade = Number(localStorage.getItem(KEY + '-recipeIdUpgrade') || 0) > 0 && removed.every(k => /^(recipe|fav|selected)\//.test(k));
  if (!idUpgrade && removed.length >= 25 && removed.length > Object.keys(hashes).length * 0.2) {
    // Guard against one phone wiping the family's data by accident.
    if (!confirm(`This phone is about to remove ${removed.length} items from your family's shared data (recipes, plan, pantry...).\n\nOK = remove them for everyone\nCancel = pause sync so you can check first`)) {
      syncInfo.paused = true; persistSync();
      throw new SyncError('Sync paused: this phone was about to remove ' + removed.length + ' shared items.', 0);
    }
  }
  for (const key of removed) rows.push({ key, value: null, deleted: true });
  // photos: put the files in storage first, then send the small markers
  const photoRows = rows.filter(r => !r.deleted && r.key.startsWith('photo/') && isPhotoMark(r.value));
  if (photoRows.length && !(await uploadPhotos(photoRows.map(r => r.key.slice(6))))) {
    // storage not set up yet: send photos the old way (once; the family already has any sent before)
    for (const r of photoRows) { const url = photoCache[r.key.slice(6)]; if (url && hashes[r.key] !== 'p') { r.value = url; r.h = 'p' } else r.skip = true }
  }
  const photoGone = rows.filter(r => r.deleted && r.key.startsWith('photo/')).map(r => r.key.slice(6));
  let batch = [], size = 0;
  const send = async () => {
    if (!batch.length) return;
    await rest('POST', 'rg_items', batch.map(r => ({ family_id: syncInfo.familyId, key: r.key, value: r.value, deleted: r.deleted })), 'resolution=merge-duplicates,return=minimal');
    for (const r of batch) r.deleted ? delete hashes[r.key] : hashes[r.key] = r.h;
    persistSync(); batch = []; size = 0;
  };
  for (const r of rows) {
    if (r.skip) continue;
    const bytes = r.key.length + (typeof r.value === 'string' ? r.value.length : JSON.stringify(r.value ?? null).length);
    if (batch.length && (batch.length >= 200 || size + bytes > 400000)) await send();
    batch.push(r); size += bytes;
  }
  await send();
  await deleteStoredPhotos(photoGone);
  try { localStorage.removeItem(KEY + '-recipeIdUpgrade') } catch (_) {}
  return rows.length;
}

async function fetchRows(familyId, since) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = `rg_items?select=key,value,deleted,updated_at&family_id=eq.${familyId}&order=updated_at.asc,key.asc&limit=${PAGE}&offset=${offset}`;
    if (since) q += '&updated_at=gte.' + encodeURIComponent(since);
    const page = await rest('GET', q);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}
function newestTime(rows, fallback) {
  let best = fallback ? Date.parse(fallback) : 0;
  for (const r of rows) { const t = Date.parse(r.updated_at); if (t > best) best = t }
  return best ? new Date(best).toISOString() : null;
}

async function pullChanges(overlap = PULL_OVERLAP_MS) {
  const since = syncInfo.cursor ? new Date(Date.parse(syncInfo.cursor) - overlap).toISOString() : null;
  const rows = await fetchRows(syncInfo.familyId, since), hashes = syncInfo.hashes ||= {};
  const local = localEntries(state, photoCache), newPhotos = {};
  let changed = 0;
  for (const row of rows) {
    const key = row.key, has = local.has(key), localHash = has ? entryHash(key, local.get(key)) : undefined;
    const dirty = has ? localHash !== hashes[key] : key in hashes;   // edited or removed here since the last sync
    if (dirty) continue;                                             // our change is sent on the next run
    if (row.deleted) {
      if (has) { removeEntry(state, photoCache, key); changed++; if (key.startsWith('photo/')) removePhoto(key.slice(6)) }
      delete hashes[key];
      continue;
    }
    const h = entryHash(key, row.value);
    if (has && localHash === h) { hashes[key] = h; continue }
    if (key.startsWith('photo/') && !isPhotoMark(row.value)) newPhotos[key.slice(6)] = row.value;
    else if (!setEntry(state, photoCache, key, row.value)) continue;   // not understood here: don't record it, so it's never sent back as deleted
    hashes[key] = h; changed++;
  }
  for (const [id, url] of Object.entries(newPhotos)) { try { await storePhoto(url, id) } catch (_) { photoCache[id] = url } }
  syncInfo.cursor = newestTime(rows, syncInfo.cursor);
  persistSync();
  if (changed) { try { ensureRecipeIds(state) } catch (_) {} localStorage.setItem(KEY, JSON.stringify(state)); showRemoteChanges() }
  downloadPendingPhotos();
  return changed;
}

let pendingRender = false;
function showRemoteChanges() {
  // Don't redraw a screen while someone is typing in it.
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.closest('main')) {
    if (!pendingRender) { pendingRender = true; el.addEventListener('blur', () => { pendingRender = false; refreshSavedViews() }, { once: true }) }
    return;
  }
  refreshSavedViews();
}

// ---------- Scheduling ----------
let syncRunning = false, syncAgain = false, syncTimer = null, firstRun = true;
function scheduleSync(delay = 1200) { if (!syncActive()) return; clearTimeout(syncTimer); syncTimer = setTimeout(runSync, delay) }
async function runSync() {
  if (!syncActive()) return;
  if (syncRunning) { syncAgain = true; return }
  syncRunning = true;
  try {
    await window.photosReady;
    if (syncInfo.paused) return setSyncStatus('paused', 'Sync is paused on this phone.');
    setSyncStatus('syncing');
    await pushChanges();
    await pullChanges(firstRun ? STARTUP_OVERLAP_MS : PULL_OVERLAP_MS);
    firstRun = false;
    syncInfo.lastSyncAt = Date.now(); persistSync();
    setSyncStatus('ok');
  } catch (e) {
    console.error('Sync failed', e);
    if (!syncAuth) setSyncStatus('signedout', 'Signed out. Sign in again to keep syncing.');
    else if (e.status === 0 && syncInfo?.paused) setSyncStatus('paused', e.message);
    else if (e instanceof TypeError || navigator.onLine === false) setSyncStatus('offline', 'Offline. Changes are saved on this phone and will sync later.');
    else if (e.status === 403) setSyncStatus('error', 'This account no longer belongs to the family. Stop syncing on this phone and join again.');
    else setSyncStatus('error', e.message);
  } finally {
    syncRunning = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300) }
  }
}
function onStateSaved() {
  scheduleSync();
  if (typeof maybeAutoSnapshot === 'function') maybeAutoSnapshot();
}

function setSyncStatus(st, message = '') {
  syncStatus = { state: st, message };
  const badge = document.getElementById('syncBadge');
  if (badge) {
    const labels = { syncing: ['↻', 'Syncing'], ok: ['✓', 'Synced'], offline: ['⚠', 'Offline'], error: ['⚠', 'Sync problem'], paused: ['⏸', 'Sync paused'], signedout: ['⚠', 'Signed out'] };
    const [icon, text] = labels[st] || ['', ''];
    badge.hidden = !syncActive() && st !== 'signedout';
    badge.className = 'sync-badge sync-' + st;
    badge.textContent = '☁ ' + icon;
    badge.title = message || text;
    badge.setAttribute('aria-label', (message || text) + '. Open family sync settings.');
  }
  if (document.getElementById('settings')?.classList.contains('active')) renderFamilyCard();
}

// ---------- Account and family actions ----------
function familyField(id) { return (document.getElementById(id)?.value || '').trim() }
function familyMessage(text, bad) { const el = document.getElementById('familyMsg'); if (el) { el.textContent = text; el.className = 'small ' + (bad ? 'warning' : 'muted') } }
// Runs an account/family action. The action may return a message to show afterwards;
// progress messages shown while it runs are cleared when it finishes.
async function withBusy(fn) {
  document.querySelectorAll('#familyCard button').forEach(b => b.disabled = true);
  familyMessage('');
  let done;
  try { done = await fn() }
  catch (e) { console.error(e); familyMessage(e instanceof TypeError ? 'Can\'t reach Supabase. Check your internet connection.' : e.message, true); document.querySelectorAll('#familyCard button').forEach(b => b.disabled = false); return }
  familyMessage(typeof done === 'string' ? done : '');
  renderFamilyCard();
}

function familySignIn(create) {
  return withBusy(async () => {
    const email = familyField('familyEmail'), password = document.getElementById('familyPassword')?.value || '';
    if (!email || !password) throw new SyncError('Enter your email and a password.');
    if (create) {
      if (password.length < 8) throw new SyncError('Use a password of at least 8 characters.');
      const j = await authCall('signup', { email, password });
      if (!keepSession(j)) return 'Account created. Open the confirmation email Supabase sent you, then come back and sign in.';
    } else keepSession(await authCall('token?grant_type=password', { email, password }));
    if (syncInfo?.familyId) runSync();
  });
}
function familyCreate() {
  return withBusy(async () => {
    const name = familyField('familyName') || 'Our kitchen', displayName = familyField('familyDisplayName');
    const [fam] = await rpc('rg_create_family', { p_name: name, p_display_name: displayName });
    syncInfo = { familyId: fam.id, familyName: fam.name, joinCode: fam.join_code, displayName, cursor: null, hashes: {}, lastSyncAt: 0 };
    persistSync();
    familyMessage('Uploading this phone\'s recipes, plan and pantry…');
    await runSync();
    if (syncStatus.state !== 'ok') throw new SyncError('The family was created, but the first upload didn\'t finish: ' + syncStatus.message + ' It will keep trying.');
  });
}
function familyJoin() {
  return withBusy(async () => {
    const code = familyField('familyCode'), displayName = familyField('familyDisplayName');
    if (!code) throw new SyncError('Enter the join code shown on the other phone.');
    if (!confirm('Joining replaces the recipes, plan, pantry and lists on this phone with the family\'s shared copy.\n\nA backup of this phone\'s current data is saved first (Settings → Automatic backups).')) return;
    const [fam] = await rpc('rg_join_family', { p_code: code, p_display_name: displayName });
    await window.photosReady;
    familyMessage('Downloading your family\'s data…');
    if (typeof createSnapshot === 'function') await createSnapshot('Before joining a family');
    const rows = await fetchRows(fam.id, null);
    const next = clone(state), photos = {}, hashes = {};
    pendingPhotos.clear();
    clearSharedData(next);
    for (const row of rows) if (!row.deleted) { setEntry(next, photos, row.key, row.value); hashes[row.key] = entryHash(row.key, row.value) }
    if (typeof replaceAllPhotos === 'function') { try { await replaceAllPhotos(photos) } catch (_) { window.photoCache = photos } } else window.photoCache = photos;
    state = next;
    syncInfo = { familyId: fam.id, familyName: fam.name, joinCode: fam.join_code, displayName, cursor: newestTime(rows, null), hashes, lastSyncAt: Date.now() };
    persistSync();
    localStorage.setItem(KEY, JSON.stringify(state));
    savePending();
    refreshSavedViews();
    setSyncStatus('ok');
    toast('Joined ' + fam.name);
    downloadPendingPhotos();
  });
}
async function familyStop() {
  if (!confirm('Stop syncing on this phone?\n\nThis phone keeps its current data but no longer sends or receives changes. The family\'s shared data is not affected.')) return;
  const token = syncAuth?.access_token;
  syncAuth = null; syncInfo = null; writeStore(AUTH_STORE, null); writeStore(SYNC_STORE, null);
  pendingPhotos.clear(); savePending();
  if (token) authCall('logout', {}, token).catch(() => {});
  setSyncStatus('idle');
  renderFamilyCard();
}
function familyResume() { if (syncInfo) { syncInfo.paused = false; persistSync(); runSync() } }
function familyUseShared() {
  if (!confirm('Replace this phone\'s data with the family\'s shared copy?\n\nA backup of this phone\'s current data is saved first.')) return;
  return withBusy(async () => {
    if (typeof createSnapshot === 'function') await createSnapshot('Before downloading the family copy');
    const rows = await fetchRows(syncInfo.familyId, null), next = clone(state), photos = {}, hashes = {};
    clearSharedData(next);
    for (const row of rows) if (!row.deleted) { setEntry(next, photos, row.key, row.value); hashes[row.key] = entryHash(row.key, row.value) }
    try { await replaceAllPhotos(photos) } catch (_) { window.photoCache = photos }
    state = next;
    Object.assign(syncInfo, { hashes, cursor: newestTime(rows, null), paused: false, lastSyncAt: Date.now() });
    persistSync(); localStorage.setItem(KEY, JSON.stringify(state)); refreshSavedViews(); setSyncStatus('ok');
  });
}
async function shareJoinCode() {
  const text = `Join our kitchen in Gingham: Settings → Family sync → Join with code ${syncInfo.joinCode}`;
  try { if (navigator.share) return await navigator.share({ title: 'Family join code', text }) } catch (e) { if (e.name === 'AbortError') return }
  try { await navigator.clipboard.writeText(syncInfo.joinCode); toast('Join code copied') } catch (_) { prompt('Join code', syncInfo.joinCode) }
}

async function renderFamilyCard() {
  const card = document.getElementById('familyCard');
  if (!card) return;
  const keepMsg = document.getElementById('familyMsg')?.textContent || '';
  let body;
  if (!syncConfigured) {
    body = `<p class="small muted">Family sync isn't connected yet. Add your Supabase project details to <code>sync-config.js</code> (see SYNC-SETUP.md), then reopen the app.</p>`;
  } else if (!syncAuth) {
    body = `${syncInfo?.familyId ? `<p class="small warning">Signed out of ${esc(syncInfo.familyName || 'your family')}. Sign in again to keep syncing.</p>` : '<p class="small muted">Share one meal plan, pantry and shopping list across your family\'s phones. Each person signs in with their own email.</p>'}
      <label for="familyEmail">Email</label><input id="familyEmail" type="email" autocomplete="email" value="${esc(syncAuth?.user?.email || '')}">
      <label for="familyPassword">Password</label><input id="familyPassword" type="password" autocomplete="current-password">
      <div class="actions"><button class="btn" onclick="familySignIn(false)">Sign in</button><button class="btn secondary" onclick="familySignIn(true)">Create account</button></div>`;
  } else if (!syncInfo?.familyId) {
    body = `<p class="small muted">Signed in as ${esc(syncAuth.user?.email || '')}.</p>
      <label for="familyDisplayName">Your name (shown to your family)</label><input id="familyDisplayName" placeholder="e.g. Dakota">
      <h4>Joining from a second phone?</h4><label for="familyCode">Join code from the other phone</label><input id="familyCode" autocapitalize="characters" placeholder="e.g. TSX4XEV7"><div class="actions"><button class="btn" onclick="familyJoin()">Join family</button></div>
      <h4>Setting up the first phone?</h4><label for="familyName">Family name</label><input id="familyName" placeholder="Our kitchen"><div class="actions"><button class="btn secondary" onclick="familyCreate()">Create family from this phone's data</button></div>
      <div class="actions"><button class="btn ghost" onclick="familyStop()">Sign out</button></div>`;
  } else {
    const last = syncInfo.lastSyncAt ? new Date(syncInfo.lastSyncAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet';
    body = `<div class="row between"><div><b>${esc(syncInfo.familyName || 'Family')}</b><div class="small muted">Signed in as ${esc(syncAuth.user?.email || '')}</div></div><span class="sync-badge sync-${syncStatus.state}">${esc({ ok: 'Synced', syncing: 'Syncing…', offline: 'Offline', error: 'Problem', paused: 'Paused' }[syncStatus.state] || 'Waiting')}</span></div>
      ${syncStatus.message ? `<p class="small ${syncStatus.state === 'error' || syncStatus.state === 'paused' ? 'warning' : 'muted'}">${esc(syncStatus.message)}</p>` : ''}
      <p class="small muted">Last synced: ${esc(last)}</p>
      <div class="join-code"><span class="small muted">Join code for another phone</span><b>${esc(syncInfo.joinCode || '')}</b></div>
      ${photoStorage === 'missing' ? `<p class="small warning">Photos are still shared the old way, inside your family's data. To move them to photo storage, run <b>photo-storage-setup.sql</b> in Supabase (see PHOTO-SETUP.md).</p>` : ''}
      ${pendingPhotos.size ? `<p class="small muted">Downloading ${pendingPhotos.size} photo${pendingPhotos.size === 1 ? '' : 's'} from your family…</p>` : ''}
      <div id="familyMembers" class="small muted"></div>
      <div class="actions"><button class="btn secondary" onclick="runSync()">Sync now</button><button class="btn secondary" onclick="shareJoinCode()">Share join code</button>
      ${syncInfo.paused ? '<button class="btn" onclick="familyResume()">Resume sync</button><button class="btn secondary" onclick="familyUseShared()">Use family\'s copy</button>' : ''}
      <button class="btn ghost" onclick="familyStop()">Stop syncing on this phone</button></div>`;
  }
  card.innerHTML = `<h3>👨‍👩‍👧 Family sync</h3>${body}<div id="familyMsg" class="small muted" role="status">${esc(keepMsg)}</div>`;
  if (syncActive()) {
    try {
      const members = await rest('GET', `rg_members?select=display_name,user_id&family_id=eq.${syncInfo.familyId}`);
      const box = document.getElementById('familyMembers');
      if (box) box.textContent = 'Members: ' + members.map(m => m.user_id === syncAuth.user?.id ? (m.display_name || 'You') + ' (this account)' : (m.display_name || 'Family member')).join(', ');
    } catch (_) {}
  }
}

// ---------- Start ----------
if (syncConfigured) {
  setInterval(() => { if (document.visibilityState === 'visible') runSync() }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runSync() });
  window.addEventListener('online', () => runSync());
  if (syncActive()) { setSyncStatus('syncing'); runSync() }
  else if (syncInfo?.familyId) setSyncStatus('signedout', 'Signed out. Sign in again to keep syncing.');
}
