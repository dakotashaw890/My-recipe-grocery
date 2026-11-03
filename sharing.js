// Share a recipe: a link anyone can open, straight to another family's Whole Kitchen, or the community.
// Opening a shared link shows the recipe with "Save to my recipes". Families' inbox for recipes sent to them.
const firstOf = j => Array.isArray(j) ? j[0] : j;
const sharingSignedIn = () => typeof syncAuth !== 'undefined' && !!syncAuth && typeof syncConfigured !== 'undefined' && syncConfigured;
const appBaseUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const sharerName = () => (typeof syncInfo !== 'undefined' && (syncInfo?.familyName || syncInfo?.displayName)) || (typeof peopleList === 'function' && peopleList()[0]?.name) || '';
function sharingMissing(e) { return e?.status === 404 || /rg_(share_link|open_link|send_recipe|family_share_code|inbox)/.test(e?.message || '') }

// ---------- the Share sheet ----------
async function openShareRecipe(rid) {
  const r = state.data.recipes[rid]; if (!r) return;
  const fam = typeof syncActive === 'function' && syncActive();
  const contacts = Object.values(state.shareContacts || {}).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8);
  openModal(`<div class="row between"><h2>Share “${esc(r.name)}”</h2><button class="iconbtn" aria-label="Close" onclick="openRecipe(decodeURIComponent('${encId(rid)}'))">✕</button></div>
    <button class="share-choice" onclick="shareRecipeLink(decodeURIComponent('${encId(rid)}'))"><span class="share-icon" aria-hidden="true">🔗</span><span><b>Send a link</b><small>Text, email or post it. Anyone can open it, and Whole Kitchen users can save it in one tap.</small></span></button>
    <div class="share-choice ${fam ? '' : 'off'}"><span class="share-icon" aria-hidden="true">👪</span><span class="grow"><b>Send to another family on Whole Kitchen</b>
      ${fam ? `<small>It lands in their Whole Kitchen, ready to save. Ask them for their family's <b>share code</b> (Settings → Help → Share code).</small>
        ${contacts.length ? `<div class="ingredient-suggestions" style="margin-top:8px">${contacts.map(c => `<button class="btn secondary" onclick="sendToFamily(decodeURIComponent('${encId(rid)}'),decodeURIComponent('${encId(c.code)}'))">${esc(c.name)}</button>`).join('')}</div>` : ''}
        <div class="share-send"><input id="shareCode" autocapitalize="characters" autocomplete="off" placeholder="Share code, e.g. K7QM-2XPA"><button class="btn" onclick="sendToFamily(decodeURIComponent('${encId(rid)}'))">Send</button></div>
        <input id="shareNote" maxlength="300" placeholder="Add a note (optional)">`
      : `<small>Turn on family sync in Settings first, then you can send recipes to other families.</small>`}</span></div>
    ${typeof openShareCommunity === 'function' && !(r.communityId && !r.publicId) ? `<button class="share-choice" onclick="openShareCommunity(decodeURIComponent('${encId(rid)}'))"><span class="share-icon" aria-hidden="true">🌍</span><span><b>${r.publicId ? 'Shared with the community' : 'Share with the community'}</b><small>${r.publicId ? 'Update it or stop sharing.' : 'Anyone using Whole Kitchen can find it in Community recipes.'}</small></span></button>` : ''}
    <div id="shareMsg" class="small" role="status"></div>`);
}
function shareMsg(t, bad) { const m = document.getElementById('shareMsg'); if (m) { m.className = 'small ' + (bad ? 'warning' : 'muted'); m.innerHTML = t } }

// ---------- links ----------
function recipePayloadFor(r) { return typeof communityRecipePayload === 'function' ? communityRecipePayload(r) : { baseServings: r.baseServings, ingredients: r.ingredients, directions: r.directions } }
async function packRecipe(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const packed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let bin = ''; for (const b of packed) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackRecipe(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/')), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
}
async function shareRecipeLink(rid) {
  const r = state.data.recipes[rid]; if (!r) return;
  shareMsg('Making the link…');
  const from = sharerName(), payload = recipePayloadFor(r);
  let url = '';
  if (sharingSignedIn()) {
    try {
      const photo = typeof publicPhotoUrl === 'function' ? await publicPhotoUrl(r).catch(() => null) : null;
      const code = firstOf(await rpc('rg_share_link', { p_name: r.name.slice(0, 120), p_recipe: payload, p_photo: photo || '', p_from: from }));
      if (code) url = appBaseUrl() + '?r=' + encodeURIComponent(code);
    } catch (e) { if (!sharingMissing(e) && !(e instanceof TypeError)) return shareMsg(esc(e.message), true) }
  }
  if (!url) {   // not signed in (or sharing not set up): the whole recipe travels inside the link
    const photo = /^https:\/\//.test(r.photoUrl || '') ? r.photoUrl : '';
    url = appBaseUrl() + '#recipe=' + await packRecipe({ n: r.name, f: from, p: photo, r: payload });
  }
  window.lastShareUrl = url;
  const text = `${r.name}${from ? ' — from ' + from : ''}. Open it in Whole Kitchen:`;
  try { if (navigator.share) { await navigator.share({ title: r.name, text, url }); shareMsg('✓ Shared'); return } } catch (e) { if (e?.name === 'AbortError') return shareMsg('') }
  try { await navigator.clipboard.writeText(url); shareMsg('✓ Link copied. Paste it in a text or email.') }
  catch (_) { shareMsg(`Copy this link: <input readonly value="${esc(url)}" onclick="this.select()">`) }
  window.lastShareUrl = url;
}

// ---------- other families ----------
async function myShareCode() {
  if (!(typeof syncActive === 'function' && syncActive())) return null;
  if (syncInfo.shareCode) return syncInfo.shareCode;
  const c = firstOf(await rpc('rg_family_share_code', { fid: syncInfo.familyId }));
  if (c) { syncInfo.shareCode = c; persistSync() }
  return c;
}
async function sendToFamily(rid, code) {
  const r = state.data.recipes[rid]; if (!r) return;
  code = String(code || document.getElementById('shareCode')?.value || '').trim().toUpperCase();
  if (code.replace(/[^A-Z0-9]/g, '').length < 8) return shareMsg('Enter their 8-character share code.', true);
  shareMsg('Finding that family…');
  try {
    const name = firstOf(await rpc('rg_family_by_share_code', { p_code: code }));
    if (!name) return shareMsg('No family has that share code. Check it with them.', true);
    if (!await ask(`Send “${r.name}” to ${name}?`, { ok: 'Send' })) return shareMsg('');
    shareMsg('Sending…');
    const photo = typeof publicPhotoUrl === 'function' ? await publicPhotoUrl(r).catch(() => null) : null;
    const to = firstOf(await rpc('rg_send_recipe', { p_code: code, p_from_family: syncInfo.familyId, p_from_name: sharerName(), p_name: r.name.slice(0, 120), p_recipe: recipePayloadFor(r), p_photo: photo || '', p_note: document.getElementById('shareNote')?.value.trim() || '' }));
    state.shareContacts ??= {}; const key = code.replace(/[^A-Z0-9]/g, '');
    state.shareContacts[key] = { code, name: to || name, at: Date.now() }; save();
    shareMsg(`✓ Sent to ${esc(to || name)}. It's waiting in their Whole Kitchen.`);
    toast('✓ Sent to ' + (to || name));
  } catch (e) { shareMsg(sharingMissing(e) ? 'Sending to families isn\'t set up yet. Run sharing-setup.sql in Supabase (SHARING-SETUP.md).' : e instanceof TypeError ? 'Couldn\'t connect. Check your internet.' : esc(e.message), true) }
}

// ---------- opening something shared ----------
function sharedPreviewHTML(x, actions) {
  const r = x.recipe || {}, ings = (r.ingredients || []).map(i => `${i.qty != null && i.qty !== '' ? fmt(num(i.qty) ?? i.qty) + ' ' : ''}${i.unit && !/^(ea\.?|each)$/i.test(i.unit) ? i.unit + ' ' : ''}${i.name}${i.note ? ', ' + i.note : ''}`);
  return `${x.photo_url ? `<img class="shared-photo" src="${esc(x.photo_url)}" alt="" onerror="this.remove()">` : ''}
    <h2>${esc(x.name)}</h2><p class="small muted">${x.from_name ? 'Shared by ' + esc(x.from_name) : 'Shared with you'}${r.baseServings ? ' · serves ' + esc(r.baseServings) : ''}${x.note ? `<br>“${esc(x.note)}”` : ''}</p>
    <h3>Ingredients</h3><ul class="shared-list">${ings.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    ${(r.directions || []).length ? `<details><summary><b>Steps (${r.directions.length})</b></summary><ol class="shared-list">${r.directions.map(d => `<li>${esc(d)}</li>`).join('')}</ol></details>` : ''}
    <div class="actions">${actions}</div>`;
}
function saveSharedRecipe(x, sourceType) {
  const r = x.recipe || {}, rid = newRecipeId();
  let name = String(x.name || 'Shared recipe'), n = 2; const base = name; while (recipeIdByName(name)) name = base + ' ' + n++;
  state.data.recipes[rid] = {
    id: rid, name, baseServings: Number(r.baseServings) || 4, prepMinutes: r.prepMinutes ?? null, cookMinutes: r.cookMinutes ?? null,
    mealTypes: Array.isArray(r.mealTypes) && r.mealTypes.length ? r.mealTypes.filter(t => RECIPE_MEAL_TYPES.includes(t)) : ['Dinner'],
    ingredients: (r.ingredients || []).map(i => ({ name: (typeof matchKnownIngredient === 'function' && matchKnownIngredient(String(i.name), String(i.name))) || String(i.name), qty: num(i.qty) ?? '', unit: String(i.unit || ''), ...(i.note ? { note: String(i.note) } : {}), fraction: null, catalog: null, auditStatus: null })),
    directions: (r.directions || []).map(String), photoUrl: /^https:\/\//.test(x.photo_url || '') ? x.photo_url : '', sourceType
  };
  save();
  if (typeof keepRecipePhoto === 'function' && state.data.recipes[rid].photoUrl) keepRecipePhoto(rid);
  return rid;
}
let openedShare = null;
async function openSharedFromAddress() {
  const q = new URLSearchParams(location.search), code = q.get('r'), packed = (location.hash.match(/#recipe=([A-Za-z0-9_-]+)/) || [])[1];
  if (!code && !packed) return false;
  history.replaceState(null, '', location.pathname);
  try {
    if (packed) { const d = await unpackRecipe(packed); openedShare = { name: d.n, from_name: d.f, photo_url: d.p, recipe: d.r } }
    else {
      const res = await fetch(SYNC_URL + '/rest/v1/rpc/rg_open_link', { method: 'POST', headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + SYNC_KEY_ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: code }) });
      const row = firstOf(await res.json().catch(() => null));
      if (!res.ok || !row) throw new Error('That recipe link has expired or was removed.');
      openedShare = row;
    }
  } catch (e) { alert(e.message?.startsWith('That') ? e.message : 'Couldn\'t open that recipe link.'); afterSharedClosed(); return true }
  openModal(`<div class="shared-view">${sharedPreviewHTML(openedShare, `<button class="btn" onclick="saveOpenedShare()">＋ Save to my recipes</button><button class="btn secondary" onclick="closeModal();afterSharedClosed()">Close</button>`)}</div>`);
  return true;
}
function saveOpenedShare() {
  const rid = saveSharedRecipe(openedShare, 'Shared' + (openedShare.from_name ? ' by ' + openedShare.from_name : ''));
  closeModal(); toast('✓ Saved to your recipes');
  if (state.welcome) { delete state.welcome; save(); showScreen('recipes'); loadScriptOnce('onboarding.js?v=44').then(() => startOnboarding()).catch(() => {}) }
  else openRecipe(rid);
}
function afterSharedClosed() { if (state.welcome && typeof openWelcome === 'function') openWelcome() }

// ---------- inbox ----------
let inboxRows = [], inboxAt = 0;
async function checkInbox(force) {
  if (!(typeof syncActive === 'function' && syncActive()) || (!force && Date.now() - inboxAt < 60000)) return renderInboxCard();
  inboxAt = Date.now();
  try { inboxRows = await rest('GET', `rg_inbox?select=id,from_name,name,recipe,photo_url,note,created_at&to_family=eq.${syncInfo.familyId}&order=created_at.desc&limit=50`) || [] } catch (_) { inboxRows = [] }
  renderInboxCard();
}
function renderInboxCard() {
  let card = document.getElementById('inboxCard');
  if (!inboxRows.length) { card?.remove(); return }
  if (!card) { const anchor = document.getElementById('backupReminder'); if (!anchor) return; card = document.createElement('div'); card.id = 'inboxCard'; anchor.parentNode.insertBefore(card, anchor) }
  const from = [...new Set(inboxRows.map(x => x.from_name).filter(Boolean))];
  card.innerHTML = `<button class="card inbox-card" onclick="openInbox()"><span class="share-icon" aria-hidden="true">📬</span><span><b>${inboxRows.length} recipe${inboxRows.length === 1 ? '' : 's'} sent to you</b><small>${from.length ? 'From ' + esc(from.slice(0, 2).join(' and ')) + (from.length > 2 ? ' and others' : '') : 'Tap to see them'}</small></span></button>`;
}
function openInbox() {
  if (!inboxRows.length) return closeModal();
  openModal(`<div class="row between"><h2>📬 Sent to you</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    ${inboxRows.map((x, i) => `<button class="share-choice" onclick="openInboxItem(${i})">${x.photo_url ? `<img class="inbox-thumb" src="${esc(x.photo_url)}" alt="" onerror="this.remove()">` : '<span class="share-icon" aria-hidden="true">🍽️</span>'}<span><b>${esc(x.name)}</b><small>${esc(x.from_name || 'Another family')} · ${esc(new Date(x.created_at).toLocaleDateString())}</small></span></button>`).join('')}`);
}
function openInboxItem(i) {
  const x = inboxRows[i]; if (!x) return;
  openModal(`<div class="shared-view">${sharedPreviewHTML(x, `<button class="btn" onclick="saveInboxItem(${i})">＋ Save to my recipes</button><button class="btn secondary" onclick="dismissInboxItem(${i})">Dismiss</button><button class="btn ghost" onclick="openInbox()">‹ Back</button>`)}</div>`);
}
async function saveInboxItem(i) {
  const x = inboxRows[i]; if (!x) return;
  const rid = saveSharedRecipe(x, 'Sent by ' + (x.from_name || 'another family'));
  await dismissInboxItem(i, true);
  toast('✓ Saved to your recipes'); openRecipe(rid);
}
async function dismissInboxItem(i, quiet) {
  const x = inboxRows[i]; if (!x) return;
  try { await rest('DELETE', `rg_inbox?id=eq.${x.id}`) } catch (_) {}
  inboxRows.splice(i, 1); renderInboxCard();
  if (!quiet) { if (inboxRows.length) openInbox(); else { closeModal(); toast('Inbox empty') } }
}
// Settings → Help: the family's share code
async function renderShareCodeLine() {
  const card = document.getElementById('guideCard'); if (!card || !(typeof syncActive === 'function' && syncActive())) return;
  let line = document.getElementById('shareCodeLine');
  if (!line) { line = document.createElement('div'); line.id = 'shareCodeLine'; line.className = 'share-code-line'; card.appendChild(line) }
  try {
    const c = await myShareCode();
    line.innerHTML = c ? `<div class="small muted">Your family's <b>share code</b>: give it to friends so they can send you recipes. (It's not your join code: it can't open your kitchen.)</div><div class="join-code"><b>${esc(c)}</b></div><div class="actions"><button class="btn secondary" onclick="navigator.clipboard?.writeText('${esc(c)}').then(()=>toast('Copied'))">Copy share code</button></div>` : '';
  } catch (_) { line.innerHTML = '' }
}

openSharedFromAddress();
checkInbox(true);
