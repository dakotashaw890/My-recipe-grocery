// Recipe groups (v20): the family's own collections, like "Weeknight" or "Holidays".
// A group lives in state.recipeGroups[id] = {id, name, emoji, order}; a recipe lists the groups it's in
// as recipe.groups = [id, ...], so one recipe can be in several groups (or none).
'use strict';

const GROUP_EMOJI = ['🍲', '🥘', '🍝', '🌮', '🍔', '🍕', '🥗', '🍗', '🐟', '🥩', '🍳', '🥞', '🥪', '🍜', '🍛', '🥣', '🍪', '🎂', '🥧', '🍰', '🎄', '🦃', '🎃', '🏈', '☀️', '❄️', '⏱️', '💰', '❤️', '⭐', '👶', '🧊'];
const GROUP_SUGGESTIONS = [['Weeknight dinners', '⏱️'], ['Freezer meals', '🧊'], ['Holidays', '🎄'], ['Kids love', '👶'], ['Game day', '🏈'], ['Desserts', '🍪'], ['Slow cooker', '🍲'], ['Budget meals', '💰']];
let recipeView = null;  // null = group tiles, 'all', 'favorites', 'ungrouped', or a group id

function newGroupId() { return 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function groupList() {
  return Object.values(state.recipeGroups || {}).filter(g => g?.id && g.name)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}
function recipeGroupIds(r) { return (r?.groups || []).filter(id => state.recipeGroups?.[id]) }
function groupRecipeIds(gid) { return Object.keys(state.data.recipes).filter(id => recipeGroupIds(state.data.recipes[id]).includes(gid)) }
function groupName(gid) { const g = state.recipeGroups?.[gid]; return g ? `${g.emoji ? g.emoji + ' ' : ''}${g.name}` : '' }
function createGroup(name, emoji) {
  name = String(name || '').trim(); if (!name) return null;
  const existing = groupList().find(g => g.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  state.recipeGroups ??= {};
  const id = newGroupId(), order = groupList().reduce((m, g) => Math.max(m, g.order ?? 0), 0) + 1;
  state.recipeGroups[id] = { id, name, emoji: emoji || '', order };
  return id;
}
function setRecipeInGroup(rid, gid, on) {
  const r = state.data.recipes[rid]; if (!r) return;
  const set = new Set(r.groups || []);
  on ? set.add(gid) : set.delete(gid);
  r.groups = [...set].filter(id => state.recipeGroups?.[id]);
  if (!r.groups.length) delete r.groups;
}

// ---------- Recipes screen ----------
function openRecipeView(view) { recipeView = view; recipeFilter = 'all'; const s = document.getElementById('recipeSearch'); if (s) s.value = ''; renderRecipes(); window.scrollTo(0, 0) }
function closeRecipeView() { recipeView = null; recipeFilter = 'all'; const s = document.getElementById('recipeSearch'); if (s) s.value = ''; renderRecipes(); window.scrollTo(0, 0) }
function recipeViewIds(view) {
  const ids = Object.keys(state.data.recipes);
  if (view === 'favorites') return ids.filter(id => state.favorites.includes(id));
  if (view === 'ungrouped') return ids.filter(id => !recipeGroupIds(state.data.recipes[id]).length);
  if (view && view !== 'all') return ids.filter(id => recipeGroupIds(state.data.recipes[id]).includes(view));
  return ids;
}
function viewTitle(view) {
  if (view === 'all') return '📖 All recipes';
  if (view === 'favorites') return '★ Favorites';
  if (view === 'ungrouped') return '📂 Not in a group';
  return groupName(view);
}
function groupCover(ids) {
  for (const id of ids) { const r = state.data.recipes[id], src = typeof recipePhotoSrc === 'function' ? recipePhotoSrc(r) : ''; if (src) return src }
  return '';
}
function groupTile(view, title, ids, emoji, hue) {
  const cover = groupCover(ids);
  return `<button class="group-tile" onclick="openRecipeView(decodeURIComponent('${encId(view)}'))" aria-label="${esc(title)}, ${ids.length} recipe${ids.length === 1 ? '' : 's'}">
    <span class="group-cover ${cover ? 'has-photo' : ''}" style="--hue:${hue}">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span class="group-emoji">${esc(emoji || '📁')}</span></span>
    <span class="group-name">${esc(title)}</span><span class="group-count">${ids.length} recipe${ids.length === 1 ? '' : 's'}</span></button>`;
}
function hueFor(text) { let h = 0; for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
function renderGroupTiles() {
  const groups = groupList(), all = recipeViewIds('all'), fav = recipeViewIds('favorites'), loose = recipeViewIds('ungrouped');
  const tiles = [groupTile('all', 'All recipes', all, '📖', 18), groupTile('favorites', 'Favorites', fav, '★', 42)];
  for (const g of groups) tiles.push(groupTile(g.id, g.name, groupRecipeIds(g.id), g.emoji, hueFor(g.name)));
  if (groups.length && loose.length) tiles.push(groupTile('ungrouped', 'Not in a group', loose, '📂', 200));
  tiles.push(`<button class="group-tile new-group" onclick="openGroupEditor()"><span class="group-cover"><span class="group-emoji">＋</span></span><span class="group-name">New group</span><span class="group-count">Your own collection</span></button>`);
  return `${groups.length ? '' : `<div class="card small muted group-hint">Make groups for the way your family cooks, like <b>Weeknight dinners</b>, <b>Holidays</b> or <b>Grandma's recipes</b>. A recipe can be in as many groups as you like.</div>`}
    <div class="group-grid">${tiles.join('')}</div>
    ${groups.length > 1 ? `<div class="actions"><button class="btn ghost" onclick="openArrangeGroups()">↕ Arrange groups</button></div>` : ''}`;
}
function recipeViewHeader(view, count) {
  const real = state.recipeGroups?.[view];
  return `<div class="view-head"><button class="btn ghost back-groups" onclick="closeRecipeView()" aria-label="Back to groups">← Groups</button>
    <h2>${esc(viewTitle(view))} <span class="muted small">${count}</span></h2>
    ${real ? `<div class="actions"><button class="btn secondary" onclick="openGroupRecipesPicker('${encId(view)}')">＋ Add recipes</button><button class="btn secondary" onclick="openGroupEditor('${encId(view)}')">✏️ Edit group</button></div>` : ''}</div>`;
}

// ---------- New / edit a group ----------
let groupDraft = null;
function openGroupEditor(encoded, after) {
  const gid = encoded ? decodeURIComponent(encoded) : null, g = gid ? state.recipeGroups?.[gid] : null;
  groupDraft = { id: gid, emoji: g?.emoji || '🍲', after: after || null };
  const used = new Set(groupList().map(x => x.name.toLowerCase()));
  const ideas = GROUP_SUGGESTIONS.filter(([n]) => !used.has(n.toLowerCase())).slice(0, 6);
  openModal(`<div class="row between"><h2>${g ? 'Edit group' : 'New group'}</h2><button class="iconbtn" aria-label="Close" onclick="closeGroupEditor()">✕</button></div>
    <label for="groupNameInput">Name</label><input id="groupNameInput" maxlength="40" value="${esc(g?.name || '')}" placeholder="e.g. Weeknight dinners" onkeydown="if(event.key==='Enter')saveGroupEditor()">
    ${!g && ideas.length ? `<div class="small muted" style="margin-top:6px">Ideas:</div><div class="chip-row">${ideas.map(([n, e]) => `<button type="button" class="chip" onclick="pickGroupIdea(decodeURIComponent('${encId(n)}'),'${e}')">${e} ${esc(n)}</button>`).join('')}</div>` : ''}
    <label>Icon</label><div class="emoji-grid" role="radiogroup" aria-label="Group icon">${GROUP_EMOJI.map(e => `<button type="button" role="radio" aria-checked="${e === groupDraft.emoji}" class="emoji-choice ${e === groupDraft.emoji ? 'on' : ''}" onclick="pickGroupEmoji('${e}')">${e}</button>`).join('')}</div>
    <div class="actions"><button class="btn" onclick="saveGroupEditor()">${g ? 'Save' : 'Create group'}</button><button class="btn secondary" onclick="closeGroupEditor()">Cancel</button>${g ? `<button class="btn danger" onclick="deleteGroup('${encId(gid)}')">Delete group</button>` : ''}</div>
    ${g ? `<p class="tiny muted">Deleting a group keeps its recipes; they just leave the group.</p>` : ''}`);
  setTimeout(() => document.getElementById('groupNameInput')?.focus(), 60);
}
function pickGroupEmoji(e) {
  groupDraft.emoji = e;
  document.querySelectorAll('.emoji-choice').forEach(b => { const on = b.textContent === e; b.classList.toggle('on', on); b.setAttribute('aria-checked', on) });
}
function pickGroupIdea(name, emoji) { document.getElementById('groupNameInput').value = name; pickGroupEmoji(emoji) }
function closeGroupEditor(newId) {
  const after = groupDraft?.after; groupDraft = null; closeModal();
  if (after) after(newId || null); else renderRecipes();
}
function saveGroupEditor() {
  const name = document.getElementById('groupNameInput')?.value.trim();
  if (!name) return alert('Give the group a name.');
  const d = groupDraft; let id = d.id;
  if (id) {
    const clash = groupList().find(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase());
    if (clash) return alert('You already have a group called “' + clash.name + '”.');
    state.recipeGroups[id] = { ...state.recipeGroups[id], name, emoji: d.emoji };
  } else {
    const before = new Set(Object.keys(state.recipeGroups || {}));
    id = createGroup(name, d.emoji);
    if (before.has(id)) toast('That group already exists');
    // a new group made while looking at the tiles opens straight away, ready to fill
    if (!d.after && !before.has(id)) recipeView = id;
  }
  save(); toast(d.id ? 'Group saved' : 'Group created');
  closeGroupEditor(id);
}
function deleteGroup(encoded) {
  const gid = decodeURIComponent(encoded), g = state.recipeGroups?.[gid]; if (!g) return;
  const n = groupRecipeIds(gid).length;
  if (!confirm(`Delete the group “${g.name}”?${n ? ` Its ${n} recipe${n === 1 ? '' : 's'} stay in your recipes.` : ''}`)) return;
  for (const id of groupRecipeIds(gid)) setRecipeInGroup(id, gid, false);
  delete state.recipeGroups[gid];
  if (recipeView === gid) recipeView = null;
  save(); groupDraft = null; closeModal(); renderRecipes(); toast('Group deleted');
}

// ---------- Arrange ----------
function openArrangeGroups() {
  const groups = groupList();
  openModal(`<div class="row between"><h2>Arrange groups</h2><button class="iconbtn" aria-label="Close" onclick="closeModal();renderRecipes()">✕</button></div>
    <p class="small muted">Use the arrows to change the order groups appear in.</p>
    <div class="arrange-list">${groups.map((g, i) => `<div class="arrange-row"><span class="grow">${esc(groupName(g.id))}</span>
      <button class="iconbtn" aria-label="Move ${esc(g.name)} up" ${i ? '' : 'disabled'} onclick="moveGroup('${encId(g.id)}',-1)">↑</button>
      <button class="iconbtn" aria-label="Move ${esc(g.name)} down" ${i < groups.length - 1 ? '' : 'disabled'} onclick="moveGroup('${encId(g.id)}',1)">↓</button>
      <button class="iconbtn" aria-label="Edit ${esc(g.name)}" onclick="openGroupEditor('${encId(g.id)}',()=>openArrangeGroups())">✏️</button></div>`).join('')}</div>
    <div class="actions"><button class="btn" onclick="closeModal();renderRecipes()">Done</button></div>`);
}
function moveGroup(encoded, dir) {
  const gid = decodeURIComponent(encoded), groups = groupList(), i = groups.findIndex(g => g.id === gid), j = i + dir;
  if (i < 0 || j < 0 || j >= groups.length) return;
  [groups[i], groups[j]] = [groups[j], groups[i]];
  // renumber only groups whose position changed, so sync sends just those
  groups.forEach((g, n) => { if (g.order !== n + 1) state.recipeGroups[g.id] = { ...g, order: n + 1 } });
  save(); openArrangeGroups();
}

// ---------- Which groups is this recipe in? (from the recipe page) ----------
function openRecipeGroups(rid) {
  const r = state.data.recipes[rid]; if (!r) return;
  const mine = new Set(recipeGroupIds(r)), groups = groupList();
  openModal(`<div class="row between"><h2>Groups for ${esc(r.name)}</h2><button class="iconbtn" aria-label="Close" onclick="openRecipe(decodeURIComponent('${encId(rid)}'))">✕</button></div>
    ${groups.length ? `<div class="group-checks">${groups.map(g => `<label class="group-check"><input type="checkbox" ${mine.has(g.id) ? 'checked' : ''} onchange="setRecipeInGroup(decodeURIComponent('${encId(rid)}'),'${g.id}',this.checked);save()"> <span>${esc(groupName(g.id))}</span><span class="muted small">${groupRecipeIds(g.id).length}</span></label>`).join('')}</div>` : `<p class="small muted">No groups yet. Make your first one below.</p>`}
    <div class="row new-group-inline"><input id="quickGroupName" maxlength="40" placeholder="New group name" onkeydown="if(event.key==='Enter')quickAddGroup('${encId(rid)}')"><button class="btn secondary" onclick="quickAddGroup('${encId(rid)}')">＋ Add</button></div>
    <div class="actions"><button class="btn" onclick="openRecipe(decodeURIComponent('${encId(rid)}'))">Done</button></div>`);
}
function quickAddGroup(encoded) {
  const rid = decodeURIComponent(encoded), name = document.getElementById('quickGroupName')?.value.trim();
  if (!name) return toast('Type a group name');
  const id = createGroup(name, '📁'); setRecipeInGroup(rid, id, true); save(); toast('Added to ' + name);
  openRecipeGroups(rid);
}
function recipeGroupPills(rid) {
  const ids = recipeGroupIds(state.data.recipes[rid]);
  return ids.map(id => `<button type="button" class="pill group-pill" onclick="closeModal();showScreen('recipes');openRecipeView('${id}')">${esc(groupName(id))}</button>`).join('');
}

// ---------- Add many recipes to a group at once ----------
function openGroupRecipesPicker(encoded) {
  const gid = decodeURIComponent(encoded), g = state.recipeGroups?.[gid]; if (!g) return;
  openModal(`<div class="row between"><h2>${esc(groupName(gid))}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal();renderRecipes()">✕</button></div>
    <p class="small muted">Tick the recipes that belong in this group.</p>
    <input id="groupPickSearch" class="search" placeholder="Search recipes…" oninput="renderGroupPickList('${encId(gid)}')">
    <div id="groupPickList" class="group-checks"></div>
    <div class="actions sticky-actions"><button class="btn" onclick="closeModal();renderRecipes()">Done</button></div>`);
  renderGroupPickList(encId(gid));
}
function renderGroupPickList(encoded) {
  const gid = decodeURIComponent(encoded), q = (document.getElementById('groupPickSearch')?.value || '').toLowerCase().trim();
  const ids = recipeIdsSorted().filter(id => !q || recipeName(id).toLowerCase().includes(q));
  const el = document.getElementById('groupPickList'); if (!el) return;
  el.innerHTML = ids.length ? ids.map(id => { const on = recipeGroupIds(state.data.recipes[id]).includes(gid); return `<label class="group-check"><input type="checkbox" ${on ? 'checked' : ''} onchange="setRecipeInGroup(decodeURIComponent('${encId(id)}'),'${gid}',this.checked);save()"> <span>${esc(recipeName(id))}</span></label>` }).join('') : '<div class="empty">No recipes found.</div>';
}

// ---------- In the recipe editor ----------
function editorGroupsHTML(selected) {
  const set = new Set(selected || []);
  return `<div class="chip-row" id="editGroupChips">${groupList().map(g => `<label class="chip check-chip"><input class="editGroup" type="checkbox" value="${esc(g.id)}" ${set.has(g.id) ? 'checked' : ''}> ${esc(groupName(g.id))}</label>`).join('')}</div>
    <div class="row new-group-inline"><input id="editNewGroup" maxlength="40" placeholder="New group name" onkeydown="if(event.key==='Enter'){event.preventDefault();addGroupFromEditor()}"><button type="button" class="btn secondary" onclick="addGroupFromEditor()">＋ Add group</button></div>`;
}
function addGroupFromEditor() {
  const input = document.getElementById('editNewGroup'), name = input?.value.trim();
  if (!name) return toast('Type a group name');
  const checked = [...document.querySelectorAll('.editGroup:checked')].map(x => x.value);
  const id = createGroup(name, '📁'); save();
  document.getElementById('editGroupsBox').innerHTML = editorGroupsHTML([...checked, id]);
}
function editorSelectedGroups() { return [...document.querySelectorAll('.editGroup:checked')].map(x => x.value).filter(id => state.recipeGroups?.[id]) }
