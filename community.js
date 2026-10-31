// Community recipes (v25): a public library any Gingham user can browse; families can share their own
// recipes and save others' into their recipe box. Imported recipes keep credit to where they came from.
'use strict';

let communityCache = { q: null, rows: [], at: 0 }, communityBusy = false;
function signedInForCommunity() { return typeof syncAuth !== 'undefined' && !!syncAuth && syncConfigured }
// Browsing works without an account (the public key is enough); sharing uses the person's sign-in.
async function communityRest(method, path, body, prefer) {
  if (!syncConfigured) throw new Error('Community recipes need the family sync setup (sync-config.js).');
  const token = signedInForCommunity() ? await accessToken() : SYNC_KEY_ANON;
  const r = await fetch(SYNC_URL + '/rest/v1/' + path, {
    method, headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const j = await readJSON(r);
  if (!r.ok) { const e = new Error(r.status === 404 || /rg_public_recipes/.test(j?.message || '') && /exist/.test(j?.message || '') ? 'The community library isn\'t set up in Supabase yet (community-setup.sql).' : (j?.message || 'Community recipes aren\'t available right now (' + r.status + ').')); e.status = r.status; e.code = j?.code; throw e }
  return j;
}
function communityAuthorName() {
  const n = (typeof syncInfo !== 'undefined' && (syncInfo?.familyName || syncInfo?.displayName)) || '';
  return n ? n.slice(0, 60) : 'A Gingham kitchen';
}
function sourceLabel(url, fallback) { try { return new URL(url).hostname.replace(/^www\./, '') } catch (_) { return fallback || '' } }

// ---------- Browsing (Recipes → 🌍 Community) ----------
function communityTileHTML() {
  return `<button class="group-tile community-tile" onclick="openRecipeView('community')" aria-label="Community recipes from other families"><span class="group-cover" style="--hue:150"><span class="group-emoji">🌍</span></span><span class="group-name">Community</span><span class="group-count">Recipes other families share</span></button>`;
}
async function renderCommunity() {
  const list = document.getElementById('recipeList'), head = document.getElementById('recipeViewHead'), filters = document.getElementById('recipeFilters');
  if (filters) filters.hidden = true;
  const q = (document.getElementById('recipeSearch')?.value || '').trim();
  if (head) head.innerHTML = `<div class="view-head"><button class="btn ghost back-groups" onclick="closeRecipeView()">← Groups</button><h2>🌍 Community recipes</h2><p class="small muted">Shared by Gingham families. Save one to add it to your recipes; then it's yours to change.</p></div>`;
  if (communityCache.q === q && Date.now() - communityCache.at < 60000) return paintCommunity(list, communityCache.rows);
  if (!communityCache.rows.length || communityCache.q !== q) list.innerHTML = '<div class="empty">Loading community recipes…</div>';
  // wait for typing to pause before searching
  clearTimeout(window.communityTimer);
  window.communityTimer = setTimeout(() => fetchCommunity(q, list), communityCache.q === null ? 0 : 350);
}
async function fetchCommunity(q, list) {
  if (communityBusy) return setTimeout(() => fetchCommunity(q, list), 300); communityBusy = true;
  try {
    const filter = q ? `&name=ilike.*${encodeURIComponent(q.replace(/[*%,()]/g, ' '))}*` : '';
    const rows = await communityRest('GET', `rg_public_recipes?select=id,name,author_name,author,photo_url,source_url,source_name,saves,updated_at,recipe&hidden=eq.false${filter}&order=saves.desc,updated_at.desc&limit=40`);
    communityCache = { q, rows: rows || [], at: Date.now() };
    if (recipeView === 'community' && (document.getElementById('recipeSearch')?.value || '').trim() === q) paintCommunity(list, communityCache.rows);
  } catch (e) { if (recipeView === 'community') list.innerHTML = `<div class="card small warning">${esc(e.message)}</div>` }
  finally { communityBusy = false }
}
function paintCommunity(list, rows) {
  if (!list) return;
  const mine = signedInForCommunity() ? syncAuth.user?.id : null;
  list.innerHTML = rows.length ? rows.map(r => `<div class="card recipe-card community-card">
      ${r.photo_url ? `<div class="recipe-photo"><img src="${esc(r.photo_url)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>` : ''}
      <h3>${esc(r.name)}</h3>
      <div class="small muted">by ${esc(r.author_name)}${r.source_url ? ` · from <a href="${esc(r.source_url)}" target="_blank" rel="noopener nofollow">${esc(r.source_name || sourceLabel(r.source_url))}</a>` : ''}${r.saves ? ` · saved by ${r.saves} famil${r.saves === 1 ? 'y' : 'ies'}` : ''}</div>
      <div class="actions"><button class="btn" onclick="openCommunityRecipe('${r.id}')">View</button>${r.author === mine ? '<span class="pill">Shared by you</span>' : `<button class="btn secondary" onclick="saveCommunityRecipe('${r.id}')">${communitySavedId(r.id) ? '✓ Saved' : '＋ Save to my recipes'}</button>`}</div></div>`).join('')
    : `<div class="empty">${communityCache.q ? 'No community recipes match that search.' : 'No community recipes yet. Share one of yours from its recipe page (🌍 Share).'}</div>`;
}
function communityRow(id) { return communityCache.rows.find(r => r.id === id) }
function communitySavedId(publicId) { return Object.keys(state.data.recipes).find(k => state.data.recipes[k].communityId === publicId) }
function openCommunityRecipe(id) {
  const row = communityRow(id); if (!row) return;
  const r = row.recipe || {}, mine = signedInForCommunity() && row.author === syncAuth.user?.id;
  openModal(`<div class="row between"><h2>${esc(row.name)}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    ${row.photo_url ? `<div class="recipe-photo-large"><img src="${esc(row.photo_url)}" alt="" onerror="this.parentElement.remove()"></div>` : ''}
    <p class="small muted">by ${esc(row.author_name)}${row.source_url ? ` · original recipe at <a href="${esc(row.source_url)}" target="_blank" rel="noopener nofollow">${esc(row.source_name || sourceLabel(row.source_url))}</a>` : ''}</p>
    <span class="pill">Serves ${esc(String(r.baseServings || 4))}</span>${typeof formatMinutes === 'function' && (r.prepMinutes || r.cookMinutes) ? `<span class="pill">⏱ ${formatMinutes((r.prepMinutes || 0) + (r.cookMinutes || 0))}</span>` : ''}
    <h3>Ingredients</h3><ul class="plain-list">${(r.ingredients || []).map(i => `<li>${esc(fmt(i.qty))} ${esc(i.unit || '')} <b>${esc(i.name)}</b>${i.note ? ` <span class="muted">· ${esc(i.note)}</span>` : ''}</li>`).join('')}</ul>
    ${(r.directions || []).length ? `<h3>Steps</h3><ol class="plain-list">${r.directions.map(d => `<li>${esc(d)}</li>`).join('')}</ol>` : ''}
    <div class="actions">${mine ? `<button class="btn danger" onclick="unshareCommunity('${row.id}')">Remove from the community</button>` : `<button class="btn" onclick="saveCommunityRecipe('${row.id}')">${communitySavedId(row.id) ? '✓ Saved · open it' : '＋ Save to my recipes'}</button>${signedInForCommunity() ? `<button class="btn ghost" onclick="reportCommunity('${row.id}')">Report</button>` : ''}`}</div>`);
}
// copy into the family's recipe box (re-linking ingredients to ones they already have)
async function saveCommunityRecipe(id) {
  const row = communityRow(id); if (!row) return;
  const existing = communitySavedId(id);
  if (existing) { closeModal(); return openRecipe(existing) }
  const r = row.recipe || {}, rid = newRecipeId();
  let name = row.name, n = 2; while (recipeIdByName(name)) name = row.name + ' ' + n++;
  state.data.recipes[rid] = {
    id: rid, name, baseServings: Number(r.baseServings) || 4, prepMinutes: r.prepMinutes ?? null, cookMinutes: r.cookMinutes ?? null,
    mealTypes: Array.isArray(r.mealTypes) && r.mealTypes.length ? r.mealTypes.filter(t => RECIPE_MEAL_TYPES.includes(t)) : ['Dinner'],
    ingredients: (r.ingredients || []).map(i => ({ name: (typeof matchKnownIngredient === 'function' && matchKnownIngredient(String(i.name), String(i.name))) || String(i.name), qty: num(i.qty) ?? '', unit: String(i.unit || ''), ...(i.note ? { note: String(i.note) } : {}) })),
    directions: (r.directions || []).map(String), tags: [], photoUrl: row.photo_url || '', sourceUrl: row.source_url || '',
    sourceType: 'From the community · ' + row.author_name + (row.source_url ? ' (original: ' + (row.source_name || sourceLabel(row.source_url)) + ')' : ''), communityId: id
  };
  save(); closeModal(); toast('Saved to your recipes');
  communityRest('POST', 'rpc/rg_public_saved', { rid: id }).catch(() => {});
  row.saves = (row.saves || 0) + 1;
  if (recipeView === 'community') paintCommunity(document.getElementById('recipeList'), communityCache.rows);
  if (typeof promptMissingPictures === 'function') promptMissingPictures(state.data.recipes[rid].ingredients.map(i => i.name));
}
async function reportCommunity(id) {
  const reasons = ['Not a recipe / spam', 'Offensive', 'Copied without credit', 'Something else'];
  if (!await ask('Report this recipe?\n\nAfter 3 reports a recipe is hidden until it\'s reviewed.', { ok: 'Report' })) return;
  try { await communityRest('POST', 'rg_public_reports', { recipe_id: id, reason: reasons[0] }); toast('Thanks, it\'s been reported') }
  catch (e) { toast(e.code === '23505' || e.status === 409 ? 'You already reported this one' : e.message) }
}

// ---------- Sharing (from a recipe's page) ----------
function communityRecipePayload(r) {
  return { baseServings: r.baseServings, prepMinutes: r.prepMinutes ?? null, cookMinutes: r.cookMinutes ?? null, mealTypes: recipeMealTypes(r.id),
    ingredients: (r.ingredients || []).map(i => ({ name: i.name, qty: num(i.qty), unit: i.unit || '', ...(i.note ? { note: i.note } : {}) })),
    directions: (r.directions || []).flatMap(d => String(d).split(/\n+/)).map(d => d.trim()).filter(Boolean) };
}
// a photo kept only on this family's phones goes to the public photo folder; web photos are linked as they are
async function publicPhotoUrl(r) {
  const src = typeof recipePhotoSrc === 'function' ? recipePhotoSrc(r) : '';
  if (!src) return null;
  if (/^https:\/\//.test(src)) return src;
  if (!/^data:image\//.test(src)) return null;
  const blob = dataUrlToBlob(src), path = `${syncAuth.user.id}/${r.id}-${Date.now().toString(36)}.jpg`;
  await storageCall('POST', `object/public-photos/${path}`, { body: blob, headers: { 'Content-Type': blob.type, 'x-upsert': 'true' } });
  return `${SYNC_URL}/storage/v1/object/public/public-photos/${path}`;
}
function communityButtonHTML(id) {
  const r = state.data.recipes[id]; if (!r) return '';
  if (r.communityId && !r.publicId) return '';   // saved from the community: it's someone else's
  return r.publicId ? `<button class="btn secondary" onclick="openShareCommunity(decodeURIComponent('${encId(id)}'))">🌍 Shared</button>` : `<button class="btn secondary" onclick="openShareCommunity(decodeURIComponent('${encId(id)}'))">🌍 Share</button>`;
}
function openShareCommunity(id) {
  const r = state.data.recipes[id]; if (!r) return;
  if (!signedInForCommunity()) return alert('Sign in under ⚙️ Family sync to share recipes with the community.');
  const imported = !!r.sourceUrl, credit = imported ? sourceLabel(r.sourceUrl, r.sourceType) : '';
  openModal(`<div class="row between"><h2>${r.publicId ? 'Shared with the community' : 'Share with the community'}</h2><button class="iconbtn" aria-label="Close" onclick="openRecipe(decodeURIComponent('${encId(id)}'))">✕</button></div>
    <p>${r.publicId ? `“${esc(r.name)}” is in the community library.` : `Anyone using Gingham will be able to see “${esc(r.name)}” and save a copy.`}</p>
    <ul class="small muted share-facts"><li>Shown as by <b>${esc(communityAuthorName())}</b>.</li><li>Shared: name, servings, times, ingredients, steps${typeof recipePhotoSrc === 'function' && recipePhotoSrc(r) ? ', photo' : ''}. Not shared: your plan, prices, pantry or notes about your family.</li>${imported ? `<li>Credit and a link to the original at <b>${esc(credit)}</b> are always shown.</li>` : ''}<li>Changes you make later aren't shared until you tap Update.</li></ul>
    <div class="actions">${r.publicId ? `<button class="btn" onclick="shareCommunity(decodeURIComponent('${encId(id)}'))">Update the shared copy</button><button class="btn danger" onclick="unshareCommunity(null,decodeURIComponent('${encId(id)}'))">Stop sharing</button>` : `<button class="btn" onclick="shareCommunity(decodeURIComponent('${encId(id)}'))">🌍 Share</button><button class="btn secondary" onclick="openRecipe(decodeURIComponent('${encId(id)}'))">Cancel</button>`}</div>
    <div id="shareMsg" class="small muted" role="status"></div>`);
}
async function shareCommunity(id) {
  const r = state.data.recipes[id]; if (!r) return;
  const msg = document.getElementById('shareMsg'); if (msg) msg.textContent = 'Sharing…';
  document.querySelectorAll('#sheet .actions button').forEach(b => b.disabled = true);
  try {
    const row = { name: r.name.slice(0, 120), author_name: communityAuthorName(), recipe: communityRecipePayload(r),
      source_url: /^https:\/\//.test(r.sourceUrl || '') ? r.sourceUrl : null, source_name: r.sourceUrl ? sourceLabel(r.sourceUrl).slice(0, 80) : null,
      photo_url: await publicPhotoUrl(r).catch(() => null) };
    if (r.publicId) {
      const out = await communityRest('PATCH', `rg_public_recipes?id=eq.${r.publicId}`, row, 'return=representation');
      if (!out?.length) { delete r.publicId; throw new Error('The shared copy was removed. Tap Share to share it again.') }
    } else {
      const out = await communityRest('POST', 'rg_public_recipes', row, 'return=representation');
      r.publicId = out?.[0]?.id;
    }
    communityCache.at = 0; save(); toast(r.publicId ? 'Shared with the community' : 'Shared'); openRecipe(id);
  } catch (e) { if (msg) { msg.textContent = e.message; msg.className = 'small warning' } document.querySelectorAll('#sheet .actions button').forEach(b => b.disabled = false) }
}
async function unshareCommunity(publicId, localId) {
  const id = publicId || state.data.recipes[localId]?.publicId; if (!id) return;
  if (!await ask('Stop sharing this recipe?\n\nIt\'s removed from the community library. Families who already saved a copy keep theirs.', { ok: 'Stop sharing' })) return;
  try {
    await communityRest('DELETE', `rg_public_recipes?id=eq.${id}`);
    for (const r of Object.values(state.data.recipes)) if (r.publicId === id) delete r.publicId;
    communityCache.at = 0; save(); closeModal(); toast('No longer shared');
    if (localId) openRecipe(localId); else if (recipeView === 'community') renderRecipes();
  } catch (e) { alert(e.message) }
}
