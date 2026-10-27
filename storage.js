// Device storage beyond localStorage: ingredient photos and automatic backups (IndexedDB).
// Loaded after the main app script; uses its globals (state, KEY, save, clone, toast, esc, ...).
'use strict';

const DB_NAME = 'recipe-grocery';
const SNAPSHOT_LIMIT = 10;
const AUTO_SNAPSHOT_EVERY = 20 * 60 * 60 * 1000;   // roughly daily
const EXPORT_REMINDER_AFTER = 21 * 24 * 60 * 60 * 1000;

window.photoCache = {};          // photo id -> data:image URL
let photoDB = null;

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbRun(store, mode, fn) {
  return new Promise((resolve, reject) => {
    if (!photoDB) return reject(new Error('Device storage unavailable'));
    const tx = photoDB.transaction(store, mode), os = tx.objectStore(store);
    let result;
    const req = fn(os);
    if (req) req.onsuccess = () => { result = req.result };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage failed'));
  });
}
function idbAllEntries(store) {
  return new Promise((resolve, reject) => {
    const out = {}, tx = photoDB.transaction(store, 'readonly'), req = tx.objectStore(store).openCursor();
    req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue() } };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Photos ----------
function newPhotoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
async function storePhoto(dataUrl, id = newPhotoId()) {
  await idbRun('photos', 'readwrite', os => os.put(dataUrl, id));
  photoCache[id] = dataUrl;
  return id;
}
async function removePhoto(id) {
  if (!id) return;
  delete photoCache[id];
  try { await idbRun('photos', 'readwrite', os => os.delete(id)) } catch (e) { console.warn('Photo delete failed', e) }
}
async function replaceAllPhotos(photos) {
  await idbRun('photos', 'readwrite', os => { os.clear(); for (const [id, url] of Object.entries(photos)) os.put(url, id) });
  window.photoCache = { ...photos };
}
// Older versions kept camera photos inside the saved data (localStorage, ~5 MB limit).
// Move them to IndexedDB, keeping the inline copy if anything fails.
async function moveInlinePhotos(st = state) {
  let moved = 0;
  for (const [k, meta] of Object.entries(st.itemMeta || {})) {
    const url = meta?.imageUrl;
    if (typeof url !== 'string' || !/^data:image\//i.test(url)) continue;
    try {
      const id = await storePhoto(url);
      st.itemMeta[k] = { ...meta, photoId: id };
      delete st.itemMeta[k].imageUrl;
      moved++;
    } catch (e) { console.warn('Could not move photo for', k, e); return moved }
  }
  return moved;
}

// ---------- Snapshots (automatic backups on this device) ----------
async function createSnapshot(reason = 'Automatic daily backup') {
  if (!photoDB) return null;
  const snap = { id: Date.now(), at: new Date().toISOString(), reason, state: clone(state), photos: { ...photoCache } };
  await idbRun('snapshots', 'readwrite', os => os.put(snap));
  const all = await listSnapshots();
  for (const old of all.slice(SNAPSHOT_LIMIT)) await idbRun('snapshots', 'readwrite', os => os.delete(old.id));
  return snap.id;
}
async function listSnapshots() {
  if (!photoDB) return [];
  const all = Object.values(await idbAllEntries('snapshots'));
  return all.sort((a, b) => b.id - a.id);
}
let lastAutoSnapshot = null;   // time of the newest automatic backup, once known
async function maybeAutoSnapshot() {
  if (!photoDB) return;
  try {
    if (lastAutoSnapshot === null) lastAutoSnapshot = (await listSnapshots()).find(s => s.reason === 'Automatic daily backup')?.id || 0;
    if (Date.now() - lastAutoSnapshot < AUTO_SNAPSHOT_EVERY) return;
    lastAutoSnapshot = Date.now();
    await createSnapshot();
  } catch (e) { console.warn('Automatic backup skipped', e) }
}
async function restoreSnapshot(id) {
  const snap = (await listSnapshots()).find(s => s.id === id);
  if (!snap) return alert('That backup is no longer available.');
  const when = new Date(snap.at).toLocaleString();
  const shared = typeof syncActive === 'function' && syncActive();
  if (!confirm(`Restore the backup from ${when}?` + (shared ? '\n\nThis also changes your family\'s shared data on every phone.' : '') + '\n\nA backup of the current data is saved first.')) return;
  await createSnapshot('Before restoring a backup');
  for (const [pid, url] of Object.entries(snap.photos || {})) if (!photoCache[pid]) await storePhoto(url, pid);
  state = clone(snap.state);
  save();
  showScreen('home');
  toast('Backup restored');
}
async function downloadSnapshot(id) {
  const snap = (await listSnapshots()).find(s => s.id === id);
  if (snap) downloadBackupFile({ ...snap.state, photos: snap.photos }, 'gingham-backup-' + snap.at.slice(0, 10) + '.json');
}

// ---------- Backup files ----------
function downloadBackupFile(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function noteExport() { try { localStorage.setItem(KEY + '-lastExport', String(Date.now())) } catch (_) {} }
function lastExportAt() { return Number(localStorage.getItem(KEY + '-lastExport') || 0) }

function backupReminderHTML() {
  let firstSeen = Number(localStorage.getItem(KEY + '-firstSeen') || 0);
  if (!firstSeen) { firstSeen = Date.now(); try { localStorage.setItem(KEY + '-firstSeen', String(firstSeen)) } catch (_) {} }
  const snoozed = Number(localStorage.getItem(KEY + '-backupSnooze') || 0);
  const last = lastExportAt(), since = Date.now() - Math.max(last, firstSeen);
  if (since < EXPORT_REMINDER_AFTER || Date.now() < snoozed) return '';
  const days = last ? Math.floor((Date.now() - last) / 864e5) + ' days ago' : 'never on this phone';
  return `<div class="card backup-reminder"><div class="row between"><div><b>Download a backup file</b><div class="small muted">Last backup file: ${days}. Automatic backups stay on this phone; a file protects you if the phone is lost.</div></div></div><div class="actions"><button class="btn" onclick="exportData()">Download backup</button><button class="btn secondary" onclick="snoozeBackupReminder()">Later</button></div></div>`;
}
function snoozeBackupReminder() { try { localStorage.setItem(KEY + '-backupSnooze', String(Date.now() + 7 * 864e5)) } catch (_) {} renderHome() }

async function renderBackupList() {
  const box = document.getElementById('snapshotList');
  if (!box) return;
  if (!photoDB) { box.innerHTML = '<div class="small muted">Automatic backups need browser storage, which isn\'t available here.</div>'; return }
  const snaps = await listSnapshots();
  box.innerHTML = snaps.length ? snaps.map(s => {
    const recipes = Object.keys(s.state?.data?.recipes || {}).length, planned = Object.values(s.state?.plan || {}).filter(x => x?.recipe).length;
    return `<div class="listitem snapshot-row"><div class="grow"><b>${esc(new Date(s.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</b><div class="tiny muted">${esc(s.reason)} · ${recipes} recipes · ${planned} planned meals</div></div><button class="btn secondary" onclick="restoreSnapshot(${s.id})">Restore</button><button class="btn ghost" aria-label="Download this backup" onclick="downloadSnapshot(${s.id})">⬇</button></div>`;
  }).join('') : '<div class="small muted">The first automatic backup is made today.</div>';
}

// ---------- Startup ----------
window.photosReady = (async () => {
  try {
    photoDB = await idbOpen();
    window.photoCache = await idbAllEntries('photos');
    if (await moveInlinePhotos()) save();
  } catch (e) {
    console.warn('Photos and automatic backups use the older storage on this device:', e);
  }
  try { refreshSavedViews() } catch (_) {}
  maybeAutoSnapshot();
})();
