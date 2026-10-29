// Who eats at your table, and what they thought (v22).
// state.people[id] = {id, name, emoji, wontEat: ['mushrooms', ...]}
// state.ratings['<recipeId>|<personId>'] = {v: 1 | -1, at}   (personId 'all' when no people are set up)
'use strict';

const PERSON_EMOJI = ['🧑', '👩', '👨', '👧', '👦', '👶', '👵', '👴', '🧒', '🙂', '😋', '🤠'];
function peopleList() { return Object.values(state.people || {}).filter(p => p?.id && p.name).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)) }
function raters() { const p = peopleList(); return p.length ? p : [{ id: 'all', name: 'Everyone', emoji: '🍽️' }] }
function ratingOf(rid, pid) { return state.ratings?.[rid + '|' + pid]?.v || 0 }
function setRating(rid, pid, v) {
  state.ratings ??= {};
  const k = rid + '|' + pid;
  if (!v || ratingOf(rid, pid) === v) delete state.ratings[k];   // tapping the same thumb again clears it
  else state.ratings[k] = { v, at: new Date().toISOString() };
}
function recipeRatings(rid) {
  const likes = [], dislikes = [];
  for (const p of raters()) { const v = ratingOf(rid, p.id); if (v > 0) likes.push(p); else if (v < 0) dislikes.push(p) }
  return { likes, dislikes };
}
// does anyone at the table refuse an ingredient in this recipe?
function wontEatConflicts(rid) {
  const r = state.data.recipes[rid]; if (!r) return [];
  const names = (r.ingredients || []).map(i => ingredientKey(i.name) + ' ' + String(i.note || '').toLowerCase());
  const out = [];
  for (const p of peopleList()) for (const w of p.wontEat || []) {
    const word = String(w).toLowerCase().trim(); if (!word) continue;
    const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/s$/, '') + '(e?s)?\\b');
    const hit = names.find(n => re.test(n));
    if (hit) out.push({ person: p, food: word });
  }
  return out;
}
function ratingPill(rid) {
  const { likes, dislikes } = recipeRatings(rid);
  if (!likes.length && !dislikes.length) return '';
  return `<span class="pill rating-pill" title="${esc(likes.map(p => p.name).join(', '))}">👍 ${likes.length}${dislikes.length ? ` · 👎 ${dislikes.length}` : ''}</span>`;
}
function ratingSummaryHTML(rid) {
  const { likes, dislikes } = recipeRatings(rid), conflicts = wontEatConflicts(rid), multi = peopleList().length > 0;
  const who = list => list.map(p => esc(p.name)).join(', ');
  const parts = [];
  if (likes.length) parts.push(multi ? `👍 Loved by ${who(likes)}` : '👍 A family favorite');
  if (dislikes.length) parts.push(multi ? `👎 Not for ${who(dislikes)}` : '👎 Not a hit');
  return `<div class="rating-line">${parts.length ? `<span>${parts.join(' · ')}</span>` : '<span class="muted">Not rated yet</span>'}
    <button type="button" class="linkish" onclick="openRateRecipe(decodeURIComponent('${encId(rid)}'))">${parts.length ? 'Change' : 'Rate it'}</button></div>
    ${conflicts.length ? `<div class="wont-eat-line">⚠ ${conflicts.map(c => `${esc(c.person.name)} won't eat ${esc(c.food)}`).join(' · ')}</div>` : ''}`;
}

// ---------- Rate after cooking (or any time from the recipe page) ----------
function openRateRecipe(rid, afterCooking) {
  const r = state.data.recipes[rid]; if (!r) return;
  const rows = raters().map(p => { const v = ratingOf(rid, p.id); return `<div class="rate-row"><span class="rate-who">${esc(p.emoji || '🙂')} ${esc(p.name)}</span>
    <button type="button" class="thumb ${v > 0 ? 'on up' : ''}" aria-pressed="${v > 0}" aria-label="${esc(p.name)} liked it" onclick="rateTap('${encId(rid)}','${p.id}',1)">👍</button>
    <button type="button" class="thumb ${v < 0 ? 'on down' : ''}" aria-pressed="${v < 0}" aria-label="${esc(p.name)} didn't like it" onclick="rateTap('${encId(rid)}','${p.id}',-1)">👎</button></div>` }).join('');
  openModal(`<div class="row between"><h2>${afterCooking ? 'How was it?' : 'Rate this recipe'}</h2><button class="iconbtn" aria-label="Close" onclick="finishRating('${encId(rid)}')">✕</button></div>
    <p class="small muted">${esc(r.name)}. Ratings help <b>Suggest empty meals</b> pick what your family likes.</p>
    <div class="rate-list">${rows}</div>
    ${peopleList().length ? '' : `<p class="tiny muted">Rate for each person: <button type="button" class="linkish" onclick="openPeopleEditor(()=>openRateRecipe(decodeURIComponent('${encId(rid)}'),${!!afterCooking}))">add who eats at your table</button>.</p>`}
    <div class="actions"><button class="btn" onclick="finishRating('${encId(rid)}')">Done</button></div>`);
  window.rateAfterCooking = !!afterCooking;
}
function rateTap(encoded, pid, v) {
  const rid = decodeURIComponent(encoded);
  setRating(rid, pid, v); save();
  openRateRecipe(rid, window.rateAfterCooking);
}
function finishRating(encoded) { const rid = decodeURIComponent(encoded); closeModal(); if (state.data.recipes[rid]) openRecipe(rid) }

// ---------- People editor (Settings) ----------
let peopleDraft = null, peopleAfter = null;
function openPeopleEditor(after) {
  peopleAfter = typeof after === 'function' ? after : null;
  peopleDraft = peopleList().map(p => ({ ...p, wontEat: [...(p.wontEat || [])] }));
  if (!peopleDraft.length) peopleDraft.push({ id: newPersonId(), name: (typeof syncInfo !== 'undefined' && syncInfo?.displayName) || '', emoji: '🧑', wontEat: [] });
  renderPeopleEditor();
}
function newPersonId() { return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }
function renderPeopleEditor() {
  openModal(`<div class="row between"><h2>Who eats at your table</h2><button class="iconbtn" aria-label="Close" onclick="closePeopleEditor()">✕</button></div>
    <p class="small muted">Each person can rate recipes. "Won't eat" (dislikes or allergies) is checked on every recipe and skipped when suggesting meals.</p>
    <div id="peopleRows">${peopleDraft.map((p, i) => `<div class="card person-row">
      <div class="row"><select aria-label="Picture for ${esc(p.name || 'person')}" onchange="peopleDraft[${i}].emoji=this.value" class="emoji-select">${PERSON_EMOJI.map(e => `<option ${e === p.emoji ? 'selected' : ''}>${e}</option>`).join('')}</select>
      <input aria-label="Name" placeholder="Name" maxlength="24" value="${esc(p.name)}" oninput="peopleDraft[${i}].name=this.value">
      <button type="button" class="iconbtn" aria-label="Remove ${esc(p.name || 'person')}" onclick="peopleDraft.splice(${i},1);renderPeopleEditor()">✕</button></div>
      <label>Won't eat <span class="muted">(comma between items)</span></label><input placeholder="e.g. mushrooms, peanuts" value="${esc((p.wontEat || []).join(', '))}" oninput="peopleDraft[${i}].wontEat=this.value.split(',').map(x=>x.trim()).filter(Boolean)"></div>`).join('')}</div>
    <div class="actions"><button type="button" class="btn secondary" onclick="peopleDraft.push({id:newPersonId(),name:'',emoji:'${PERSON_EMOJI[peopleDraft.length % PERSON_EMOJI.length]}',wontEat:[]});renderPeopleEditor()">＋ Add person</button></div>
    <div class="actions"><button class="btn" onclick="savePeople()">Save</button><button class="btn secondary" onclick="closePeopleEditor()">Cancel</button></div>`);
}
function savePeople() {
  const list = peopleDraft.filter(p => String(p.name || '').trim());
  state.people ??= {};
  const keep = new Set(list.map(p => p.id));
  for (const id of Object.keys(state.people)) if (!keep.has(id)) {
    delete state.people[id];
    for (const k of Object.keys(state.ratings || {})) if (k.endsWith('|' + id)) delete state.ratings[k];
  }
  list.forEach((p, n) => { const v = { id: p.id, name: p.name.trim(), emoji: p.emoji || '🙂', wontEat: p.wontEat || [], order: n + 1 }; if (JSON.stringify(state.people[p.id]) !== JSON.stringify(v)) state.people[p.id] = v });
  save(); toast('Saved');
  closePeopleEditor(true);
}
function closePeopleEditor() {
  peopleDraft = null; closeModal();
  const after = peopleAfter; peopleAfter = null;
  if (after) after(); else if (typeof renderPeopleCard === 'function') renderPeopleCard();
}
function renderPeopleCard() {
  let card = document.getElementById('peopleCard');
  const host = document.getElementById('settings'); if (!host) return;
  if (!card) { card = document.createElement('div'); card.id = 'peopleCard'; card.className = 'card'; const first = host.querySelector('.card'); first ? host.insertBefore(card, first) : host.appendChild(card) }
  const list = peopleList();
  card.innerHTML = `<h3>👪 Who eats at your table</h3>
    ${list.length ? `<div class="people-chips">${list.map(p => `<span class="pill">${esc(p.emoji)} ${esc(p.name)}${p.wontEat?.length ? ` · no ${esc(p.wontEat.join(', '))}` : ''}</span>`).join('')}</div>` : '<p class="small muted">Add your family so each person can rate recipes, and list foods anyone won\'t eat.</p>'}
    <div class="actions"><button class="btn secondary" onclick="openPeopleEditor()">${list.length ? 'Edit people' : '＋ Add people'}</button></div>`;
}
