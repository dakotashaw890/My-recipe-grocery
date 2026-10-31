// Account & privacy: delete your account (Google Play requires this in the app and on the web),
// erase this phone's data, and the privacy policy link.
// deleteGinghamAccount() is also used by delete-account.html, so it only needs the web address, key and a sign-in token.

async function deleteGinghamAccount({ url, key, token, progress = () => {} }) {
  const call = async (method, path, body, extra = {}) => {
    const r = await fetch(url + path, { method, headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...extra }, body: body == null ? undefined : JSON.stringify(body) });
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null } catch (_) {}
    return { ok: r.ok, status: r.status, j };
  };
  const missingThing = res => res.status === 404 || /not found|does not exist|schema cache/i.test(JSON.stringify(res.j || ''));
  const me = await call('GET', '/auth/v1/user');
  if (!me.ok || !me.j?.id) throw new Error('Your sign-in has expired. Sign in again, then delete.');
  const uid = me.j.id;
  if (!(await call('POST', '/rest/v1/rpc/rg_family_size', { fid: '00000000-0000-0000-0000-000000000000' })).ok) throw new Error('Account deletion isn\'t set up yet. The app\'s owner needs to run account-deletion.sql in Supabase.');

  // 1. photos of any family this person is the last member of
  const fams = await call('GET', `/rest/v1/rg_members?select=family_id&user_id=eq.${uid}`);
  for (const { family_id: fid } of (fams.ok && Array.isArray(fams.j) ? fams.j : [])) {
    const size = await call('POST', '/rest/v1/rpc/rg_family_size', { fid });
    const n = Array.isArray(size.j) ? Number(size.j[0]) : Number(size.j);
    if (n > 1) continue;
    progress('Deleting your family\'s photos…');
    for (;;) {
      const list = await call('POST', '/storage/v1/object/list/photos', { prefix: fid + '/', limit: 100, offset: 0 });
      if (!list.ok) { if (missingThing(list)) break; throw new Error('Couldn\'t delete your photos. Check your connection and try again.') }
      const names = (list.j || []).filter(o => o?.name && o.id !== null).map(o => fid + '/' + o.name);
      if (!names.length) break;
      const del = await call('DELETE', '/storage/v1/object/photos', { prefixes: names });
      if (!del.ok) throw new Error('Couldn\'t delete your photos. Check your connection and try again.');
      if (names.length < 100) break;
    }
  }
  // 2. photos of recipes they shared publicly
  const mine = await call('GET', `/rest/v1/rg_public_recipes?select=photo_url&author=eq.${uid}`);
  const paths = (mine.ok && Array.isArray(mine.j) ? mine.j : []).map(r => String(r.photo_url || '').split('/public-photos/')[1]).filter(Boolean).map(decodeURIComponent);
  if (paths.length) {
    progress('Deleting your shared recipe photos…');
    const del = await call('DELETE', '/storage/v1/object/public-photos', { prefixes: paths });
    if (!del.ok && !missingThing(del)) throw new Error('Couldn\'t delete your shared recipe photos. Check your connection and try again.');
  }
  // 3. the account and everything tied to it
  progress('Deleting your account…');
  const done = await call('POST', '/rest/v1/rpc/rg_delete_my_account', {});
  if (!done.ok) throw new Error(done.j?.message || 'Couldn\'t delete the account. Please try again.');
  call('POST', '/auth/v1/logout', {}).catch(() => {});
  const r = Array.isArray(done.j) ? done.j[0] : done.j;
  return { familiesDeleted: Number(r?.families_deleted || 0) };
}

// ---------- in the app ----------
function renderAccountCard() {
  const box = document.getElementById('accountCard'); if (!box) return;
  const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth && typeof syncConfigured !== 'undefined' && syncConfigured;
  box.innerHTML = `<h3>Account & privacy</h3>
    <p class="small muted">Gingham keeps your recipes on this phone${signedIn ? ' and, because you use family sync, in your family\'s private Supabase storage' : ''}. No ads, no tracking, and your data is never sold.</p>
    <div class="actions"><a class="btn secondary" href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></div>
    <div class="adv-block danger-zone"><b>Delete data</b>
      ${signedIn ? `<p class="small muted">Signed in as ${esc(syncAuth?.user?.email || 'your account')}. Deleting your account removes your sign-in and your data from Supabase. This can't be undone.</p><div class="actions"><button class="btn danger" onclick="openDeleteAccount()">Delete my account…</button></div>` : '<p class="small muted">You\'re not signed in, so nothing is stored outside this phone.</p>'}
      <div class="actions"><button class="btn ghost" onclick="eraseThisPhone()">Erase everything on this phone…</button></div></div>`;
}
async function openDeleteAccount() {
  let note = '';
  try {
    if (syncInfo?.familyId) {
      const r = await fetch(SYNC_URL + '/rest/v1/rpc/rg_family_size', { method: 'POST', headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fid: syncInfo.familyId }) });
      const j = await r.json().catch(() => null), n = Array.isArray(j) ? Number(j[0]) : Number(j);
      if (r.ok) note = n > 1 ? `<li>You leave “${esc(syncInfo.familyName || 'your family')}”. The other ${n - 1} member${n - 1 === 1 ? '' : 's'} keep the family's recipes, plans and lists.</li>` : `<li>You're the only member of “${esc(syncInfo.familyName || 'your family')}”, so its shared recipes, plans, lists and photos are deleted too.</li>`;
    }
  } catch (_) {}
  openModal(`<div class="row between"><h2>Delete your account?</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small">This permanently deletes:</p>
    <ul class="small app-list"><li>Your sign-in (${esc(syncAuth?.user?.email || 'email and password')})</li>${note}<li>Any recipes you shared to Community recipes</li></ul>
    <p class="small muted">Recipes on this phone stay unless you choose to erase them too. Download a backup first if you might want them later.</p>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="deleteAlsoPhone" style="width:auto"> Also erase everything on this phone</label>
    <label for="deleteConfirm">Type DELETE to confirm</label><input id="deleteConfirm" autocomplete="off" autocapitalize="characters" oninput="document.getElementById('deleteGo').disabled=this.value.trim().toUpperCase()!=='DELETE'">
    <div class="actions"><button class="btn danger" id="deleteGo" disabled onclick="runDeleteAccount()">Delete my account</button><button class="btn secondary" onclick="closeModal()">Cancel</button></div>
    <div id="deleteMsg" class="small" role="status"></div>`);
}
async function runDeleteAccount() {
  const msg = document.getElementById('deleteMsg'), also = document.getElementById('deleteAlsoPhone')?.checked;
  document.querySelectorAll('#sheet button').forEach(b => b.disabled = true);
  const say = (t, bad) => { if (msg) { msg.textContent = t; msg.className = 'small ' + (bad ? 'warning' : 'muted') } };
  try {
    const token = await accessToken();
    const res = await deleteGinghamAccount({ url: SYNC_URL, key: SYNC_KEY_ANON, token, progress: t => say(t) });
    syncAuth = null; syncInfo = null; writeStore(AUTH_STORE, null); writeStore(SYNC_STORE, null);
    try { pendingPhotos.clear(); savePending() } catch (_) {}
    try { setSyncStatus('idle') } catch (_) {}
    if (also) return eraseThisPhone(true);
    closeModal(); renderSettingsExtras?.(); renderAccountCard();
    toast('Your account was deleted' + (res.familiesDeleted ? ' along with your family\'s shared data' : ''));
  } catch (e) {
    say(e instanceof TypeError ? 'Couldn\'t reach Supabase. Check your connection and try again.' : e.message, true);
    document.querySelectorAll('#sheet button').forEach(b => b.disabled = false);
    const go = document.getElementById('deleteGo'); if (go) go.disabled = document.getElementById('deleteConfirm')?.value.trim().toUpperCase() !== 'DELETE';
  }
}
async function eraseThisPhone(skipAsk) {
  if (!skipAsk) {
    if (typeof syncActive === 'function' && syncActive()) return alert('This phone is syncing with your family. Choose "Stop syncing on this phone" in Family sync first (or delete your account).');
    if (!await ask('Erase everything on this phone?\n\nRecipes, plans, lists, photos and automatic backups on this phone are deleted. This can\'t be undone, so download a backup file first if you might want them.', { ok: 'Erase', danger: true })) return;
  }
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(KEY) || k.startsWith('rg-') || k.startsWith('gingham')) localStorage.removeItem(k) } catch (_) {}
  try { photoDB?.close?.() } catch (_) {}
  await new Promise(res => { try { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res() } catch (_) { res() } });
  try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))) } catch (_) {}
  location.replace(location.pathname);
}
