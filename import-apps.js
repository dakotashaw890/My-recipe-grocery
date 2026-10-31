// Bring recipes over from other recipe apps: Paprika, Mela, Plan to Eat, Mealie, Tandoor, Recipe Keeper,
// Copy Me That, and any export that uses the standard recipe format (schema.org). Everything is read on
// this phone; nothing is uploaded until the recipes are saved like any other recipe.

// ---------- reading files ----------
async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const utf8 = b => new TextDecoder('utf-8').decode(b);
const isZip = b => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isGzip = b => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
// Minimal .zip reader (stored and deflated entries — what every recipe app writes).
async function unzip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = [];
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('That zip file looks damaged.');
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = utf8(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true), raw = bytes.subarray(start, start + size);
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: await inflate(raw, 'deflate-raw') });
  }
  return out;
}

// ---------- small helpers ----------
function minutesFrom(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const s = String(v).trim(), iso = s.match(/^P(?:T)?(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso && /^P/i.test(s)) { const m = (Number(iso[1] || 0) * 1440) + Number(iso[2] || 0) * 60 + Number(iso[3] || 0); return m || null }
  return typeof parseDuration === 'function' ? parseDuration(s) : null;
}
function servingsFrom(v) { const m = String(Array.isArray(v) ? v[0] : v ?? '').match(/\d+(\.\d+)?/); const n = m ? Math.round(Number(m[0])) : 0; return n > 0 && n < 200 ? n : 4 }
function linesFrom(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(linesFrom);
  if (typeof v === 'object') {
    if (v['@type'] === 'HowToSection' || v.itemListElement) return linesFrom(v.itemListElement);
    return linesFrom(v.text || v.name || v.instruction || '');
  }
  return String(v).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}
const stepLines = v => linesFrom(v).map(x => x.replace(/^\s*(step\s*)?\d+[.):]\s*/i, '')).filter(Boolean);
const ingredientLines = v => linesFrom(v).filter(l => !(/:$/.test(l) && l.length < 60) && !/^#+\s/.test(l));
const listFrom = v => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map(x => String(typeof x === 'object' ? x?.name || '' : x).trim()).filter(Boolean);
function imageFrom(v) {
  const x = Array.isArray(v) ? v[0] : v;
  const u = typeof x === 'object' && x ? x.url || x.contentUrl : x;
  return /^https:\/\//i.test(String(u || '')) ? String(u) : '';
}

// One common shape for every app: {name, servings, prep, cook, ingredients:[lines], steps:[lines], categories, sourceUrl, notes, photoData|photoUrl}
function fromSchemaOrg(o) {
  return { name: String(o.name || o.headline || '').trim(), servings: servingsFrom(o.recipeYield), prep: minutesFrom(o.prepTime), cook: minutesFrom(o.cookTime) ?? (o.totalTime && !o.prepTime ? minutesFrom(o.totalTime) : null),
    ingredients: ingredientLines(o.recipeIngredient || o.ingredients), steps: stepLines(o.recipeInstructions), categories: [...listFrom(o.recipeCategory), ...listFrom(o.keywords).slice(0, 3)],
    sourceUrl: /^https?:/.test(o.url || '') ? o.url : '', notes: '', photoUrl: imageFrom(o.image) };
}
function fromPaprika(o) {
  return { name: String(o.name || '').trim(), servings: servingsFrom(o.servings), prep: minutesFrom(o.prep_time), cook: minutesFrom(o.cook_time) ?? minutesFrom(o.total_time),
    ingredients: ingredientLines(o.ingredients), steps: stepLines(o.directions), categories: listFrom(o.categories), sourceUrl: o.source_url || '', notes: o.notes || '',
    photoData: o.photo_data ? 'data:image/jpeg;base64,' + o.photo_data : '', photoUrl: imageFrom(o.image_url), rating: o.rating };
}
function fromMela(o) {
  return { name: String(o.title || '').trim(), servings: servingsFrom(o.yield), prep: minutesFrom(o.prepTime), cook: minutesFrom(o.cookTime) ?? minutesFrom(o.totalTime),
    ingredients: ingredientLines(o.ingredients), steps: stepLines(o.instructions), categories: listFrom(o.categories), sourceUrl: o.link || '', notes: o.notes || '',
    photoData: o.images?.[0] ? 'data:image/jpeg;base64,' + o.images[0] : '' };
}
function fromTandoor(o) {
  const ingredients = [], steps = [];
  for (const s of o.steps || []) {
    if (s.instruction) steps.push(...stepLines(s.instruction));
    for (const i of s.ingredients || []) { if (i.is_header) continue; const food = i.food?.name || ''; if (!food) continue; ingredients.push([i.amount && !i.no_amount ? i.amount : '', i.unit?.name || '', food, i.note ? ', ' + i.note : ''].join(' ').replace(/\s+/g, ' ').trim()) }
  }
  return { name: String(o.name || '').trim(), servings: servingsFrom(o.servings), prep: minutesFrom(o.working_time), cook: minutesFrom(o.waiting_time), ingredients, steps, categories: listFrom((o.keywords || []).map(k => k.name || k)), sourceUrl: o.source_url || '', notes: o.description || '' };
}
function looksSchemaRecipe(o) { const t = o?.['@type']; return o && typeof o === 'object' && (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe')) || (o.recipeIngredient && o.name)) }
function recipesFromJSON(j) {
  if (Array.isArray(j)) return j.flatMap(recipesFromJSON);
  if (!j || typeof j !== 'object') return [];
  if (j['@graph']) return recipesFromJSON(j['@graph']);
  if (looksSchemaRecipe(j)) return [fromSchemaOrg(j)];
  if ('photo_data' in j || ('directions' in j && 'ingredients' in j && 'name' in j)) return [fromPaprika(j)];
  if ('title' in j && 'instructions' in j && 'ingredients' in j) return [fromMela(j)];
  if (Array.isArray(j.steps) && 'name' in j && j.steps.some(s => s && 'ingredients' in s)) return [fromTandoor(j)];
  for (const k of ['recipes', 'data', 'items']) if (Array.isArray(j[k])) return recipesFromJSON(j[k]);
  return [];
}
function recipesFromHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) { try { out.push(...recipesFromJSON(JSON.parse(s.textContent))) } catch (_) {} }
  if (out.length) return out;
  // microdata (Recipe Keeper, Copy Me That and many printed-page exports)
  for (const el of doc.querySelectorAll('[itemtype*="schema.org/Recipe"]')) {
    const prop = n => [...el.querySelectorAll(`[itemprop="${n}"]`)];
    const val = e => e?.getAttribute('content') || e?.getAttribute('src') || e?.textContent?.trim() || '';
    out.push(fromSchemaOrg({ name: val(prop('name')[0]), recipeYield: val(prop('recipeYield')[0]), prepTime: val(prop('prepTime')[0]), cookTime: val(prop('cookTime')[0]),
      recipeIngredient: prop('recipeIngredient').concat(prop('ingredients')).flatMap(e => linesFrom(e.innerHTML)), recipeInstructions: prop('recipeInstructions').flatMap(e => linesFrom(e.innerHTML)),
      recipeCategory: prop('recipeCategory').map(val), url: val(prop('url')[0]), image: val(prop('image')[0]) }));
  }
  return out;
}
// Plan to Eat (and other spreadsheet exports): one row per recipe
function parseCSV(text) {
  const rows = [[]]; let f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true; else if (c === ',') { rows.at(-1).push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; rows.at(-1).push(f); f = ''; rows.push([]) }
    else f += c;
  }
  rows.at(-1).push(f);
  return rows.filter(r => r.some(x => x.trim()));
}
function recipesFromCSV(text) {
  const rows = parseCSV(text.replace(/^﻿/, '')); if (rows.length < 2) return [];
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names) => { const i = head.findIndex(h => names.includes(h)); return i };
  const c = { name: col('title', 'name', 'recipe', 'recipename'), ing: col('ingredients', 'ingredient'), dir: col('directions', 'instructions', 'method', 'steps'), serv: col('servings', 'serves', 'yield'),
    prep: col('preptime', 'prep'), cook: col('cooktime', 'cook'), total: col('totaltime'), url: col('url', 'source', 'sourceurl', 'link'), tags: col('tags', 'categories', 'category'), course: col('course'), notes: col('notes'), photo: col('photourl', 'image', 'imageurl', 'photo') };
  if (c.name < 0 || c.ing < 0) return [];
  return rows.slice(1).map(r => {
    const g = i => i >= 0 ? (r[i] || '').trim() : '';
    return { name: g(c.name), servings: servingsFrom(g(c.serv)), prep: minutesFrom(g(c.prep)), cook: minutesFrom(g(c.cook)) ?? minutesFrom(g(c.total)), ingredients: ingredientLines(g(c.ing)), steps: stepLines(g(c.dir)),
      categories: [...listFrom(g(c.course)), ...listFrom(g(c.tags))], sourceUrl: /^https?:/.test(g(c.url)) ? g(c.url) : '', notes: g(c.notes), photoUrl: imageFrom(g(c.photo)) };
  }).filter(x => x.name && x.ingredients.length);
}

// Any file (or file inside a zip) -> recipes
async function recipesFromBytes(name, bytes, depth = 0) {
  if (isZip(bytes) && depth < 3) { const out = []; for (const e of await unzip(bytes)) out.push(...await recipesFromBytes(e.name, e.data, depth + 1)); return out }
  if (isGzip(bytes)) return recipesFromBytes(name.replace(/\.gz$/, ''), await inflate(bytes, 'gzip'), depth + 1);
  const text = utf8(bytes).trim();
  if (/\.(jpe?g|png|webp|gif|pdf)$/i.test(name)) return [];
  if (text.startsWith('{') || text.startsWith('[')) { try { return recipesFromJSON(JSON.parse(text)) } catch (_) { return [] } }
  if (/<(html|script|div|body)/i.test(text.slice(0, 2000))) return recipesFromHTML(text);
  if (/\.(csv|tsv)$/i.test(name) || /^[^\n]*\b(title|name)\b[^\n]*,[^\n]*ingredients/i.test(text.slice(0, 500))) return recipesFromCSV(text);
  return [];
}
function appNameFor(file) {
  const n = file.toLowerCase();
  if (n.includes('paprika')) return 'Paprika'; if (n.includes('mela')) return 'Mela'; if (n.endsWith('.csv')) return 'Plan to Eat or a spreadsheet';
  if (n.includes('mealie')) return 'Mealie'; if (n.includes('tandoor')) return 'Tandoor'; return 'another app';
}

// ---------- the import screen ----------
let appImport = null;   // {source, recipes:[{...shape, pick, dup, lines:[{p, known}]}], unknown: Map(lower -> {name, count, use})}
function openAppImport() {
  closeModal();
  openModal(`<div class="row between"><h2>Bring recipes from another app</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">Export your recipes from the other app, then choose that file here. Works with:</p>
    <ul class="small app-list"><li><b>Paprika</b> — Settings → Export → “Paprika Recipe Format” (.paprikarecipes)</li><li><b>Plan to Eat</b> — Settings → Export recipes (.csv)</li><li><b>Mela</b> — Export (.melarecipes)</li><li><b>Mealie, Tandoor, Recipe Keeper, Copy Me That</b> — their export (.zip, .json or .html)</li><li>Any file of recipes in the standard web recipe format</li></ul>
    <input id="appImportFile" type="file" hidden multiple accept=".paprikarecipes,.paprikarecipe,.melarecipes,.melarecipe,.csv,.json,.zip,.html,.htm,.txt" onchange="readAppImport(this.files)">
    <div class="actions"><button class="btn" onclick="document.getElementById('appImportFile').click()">Choose export file</button></div>
    <div id="appImportMsg" class="small" role="status"></div>`);
}
async function readAppImport(files) {
  const msg = document.getElementById('appImportMsg'); if (!files?.length) return;
  msg.className = 'small muted'; msg.textContent = 'Reading…';
  try {
    if (typeof ensureCatalog === 'function') await ensureCatalog();
    let found = [];
    for (const f of files) found.push(...(await recipesFromBytes(f.name, new Uint8Array(await f.arrayBuffer()))).map(r => ({ ...r, app: appNameFor(f.name) })));
    found = found.filter(r => r.name && r.ingredients.length);
    if (!found.length) { msg.className = 'small warning'; msg.textContent = 'No recipes found in that file. Make sure it\'s the export file from your other app (see the list above).'; return }
    buildAppImport(found, files.length === 1 ? files[0].name : files.length + ' files');
    renderAppImport();
  } catch (e) { console.error(e); msg.className = 'small warning'; msg.textContent = 'Couldn\'t read that file: ' + e.message }
}
function buildAppImport(found, source) {
  const unknown = new Map(), seen = new Set();
  const recipes = found.map(r => {
    const lines = r.ingredients.map(line => {
      const p = parseIngredientLine(line), full = p.note ? p.note + ' ' + p.name : p.name, known = p.name ? matchKnownIngredient(p.name, full) : null;
      if (p.name && !known) { const k = p.name.toLowerCase().trim(); const u = unknown.get(k) || { name: p.name, count: 0, use: null }; u.count++; unknown.set(k, u) }
      return { p, known };
    }).filter(x => x.p.name);
    const key = r.name.toLowerCase(), dup = !!recipeIdByName(r.name) || seen.has(key); seen.add(key);
    return { ...r, lines, dup, pick: !dup };
  });
  appImport = { source, recipes, unknown };
}
function unknownChoiceHTML(k, u) {
  const opts = (typeof ingredientDidYouMean === 'function' ? ingredientDidYouMean(u.name, 3) : []).map(x => x.k);
  const enc = encId(k);
  return `<div class="unknown-row ${u.use ? 'done' : ''}"><div><b>${esc(u.name)}</b> <span class="tiny muted">in ${u.count} recipe${u.count === 1 ? '' : 's'}</span>${u.use ? `<div class="small ing-ok">✓ ${u.use === '__new' ? 'Added as a new ingredient' : 'Will use ' + esc(u.use)} <button class="linkbtn" onclick="setUnknownChoice('${enc}','')">change</button></div>` : ''}</div>
    ${u.use ? '' : `<div class="ingredient-suggestions">${opts.map(o => `<button class="btn secondary" onclick="setUnknownChoice('${enc}',decodeURIComponent('${encId(o)}'))">${esc(o)}</button>`).join('')}<button class="btn ghost ing-add" onclick="setUnknownChoice('${enc}','__new')">＋ Keep “${esc(u.name)}” as a new ingredient</button></div>`}</div>`;
}
function setUnknownChoice(enc, use) { const u = appImport.unknown.get(decodeURIComponent(enc)); if (u) u.use = use || null; renderAppImport() }
function keepAllUnknown() { for (const u of appImport.unknown.values()) if (!u.use) u.use = '__new'; renderAppImport() }
function toggleAppImportPick(i) { appImport.recipes[i].pick = !appImport.recipes[i].pick; renderAppImport() }
function setAllAppImportPicks(on) { appImport.recipes.forEach(r => r.pick = on && !r.dup || (on && r.pick)); renderAppImport() }
function renderAppImport() {
  const a = appImport; if (!a) return;
  const picked = a.recipes.filter(r => r.pick);
  const needed = new Set(picked.flatMap(r => r.lines.filter(l => !l.known).map(l => l.p.name.toLowerCase().trim())));
  const open = [...a.unknown.entries()].filter(([k]) => needed.has(k)), left = open.filter(([, u]) => !u.use).length;
  const scrollY = document.getElementById('sheet')?.scrollTop || 0;
  openModal(`<div class="row between"><h2>Bring recipes over</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">Found <b>${a.recipes.length}</b> recipe${a.recipes.length === 1 ? '' : 's'} in ${esc(a.source)}.${a.recipes.some(r => r.dup) ? ' Recipes you already have are unticked.' : ''}</p>
    ${open.length ? `<div class="card"><h3>${left ? left + ' ingredient name' + (left === 1 ? '' : 's') + ' to check' : '✓ All ingredient names checked'}</h3><p class="small muted">These aren't on Gingham's ingredient list. Pick the right one, or keep the name as a new ingredient.</p>${open.map(([k, u]) => unknownChoiceHTML(k, u)).join('')}${left > 1 ? '<div class="actions"><button class="btn ghost" onclick="keepAllUnknown()">Keep all the rest as new ingredients</button></div>' : ''}</div>` : ''}
    <div class="card"><div class="row between"><h3>Recipes (${picked.length} chosen)</h3><span><button class="linkbtn" onclick="setAllAppImportPicks(true)">All</button> · <button class="linkbtn" onclick="appImport.recipes.forEach(r=>r.pick=false);renderAppImport()">None</button></span></div>
    ${a.recipes.map((r, i) => `<label class="import-pick"><input type="checkbox" ${r.pick ? 'checked' : ''} onchange="toggleAppImportPick(${i})"><span><b>${esc(r.name)}</b><span class="tiny muted"> · ${r.lines.length} ingredients${r.steps.length ? ' · ' + r.steps.length + ' steps' : ''}${r.photoData || r.photoUrl ? ' · 📷' : ''}${r.dup ? ' · already in your recipes' : ''}</span></span></label>`).join('')}</div>
    <div class="actions"><button class="btn" onclick="finishAppImport()" ${!picked.length || left ? 'disabled' : ''}>Add ${picked.length} recipe${picked.length === 1 ? '' : 's'}</button></div>
    ${left ? '<p class="small muted">Check the ingredient names above to continue.</p>' : ''}<div id="appImportMsg" class="small" role="status"></div>`);
  const sheet = document.getElementById('sheet'); if (sheet) sheet.scrollTop = scrollY;
}
async function shrinkPhoto(dataUrl, max = 1000) {
  try {
    const img = await createImageBitmap(await (await fetch(dataUrl)).blob()), s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .8);
  } catch (_) { return null }
}
function mealTypesFor(cats) {
  const t = cats.join(' ').toLowerCase(), out = [];
  if (/breakfast|brunch/.test(t)) out.push('Breakfast');
  if (/lunch|sandwich/.test(t)) out.push('Lunch');
  if (/dinner|main|entree|entrée|supper/.test(t)) out.push('Dinner');
  if (/snack|appetizer|dessert|treat|cookie|baking|dip/.test(t) && !out.length) out.push('Snack');
  return out.length ? out : ['Dinner'];
}
async function finishAppImport() {
  const a = appImport, picked = a.recipes.filter(r => r.pick); if (!picked.length) return;
  const btn = document.querySelector('#sheet .actions .btn'); if (btn) { btn.disabled = true; btn.textContent = 'Adding…' }
  const msg = document.getElementById('appImportMsg');
  let photos = 0, n = 0;
  try { await window.photosReady } catch (_) {}
  for (const r of picked) {
    n++; if (msg) msg.textContent = `Adding ${n} of ${picked.length}…`;
    const ingredients = r.lines.map(({ p, known }) => {
      const u = known ? null : a.unknown.get(p.name.toLowerCase().trim());
      const name = known || (u?.use && u.use !== '__new' ? u.use : p.name.charAt(0).toUpperCase() + p.name.slice(1));
      const pk = getPackage(name);
      return { name, qty: p.qty ?? '', unit: p.unit || '', note: p.note || undefined, container: pk?.label || p.sizeNote || '', containerSize: pk ? Number(pk.qty) || null : null, fraction: null, catalog: null, auditStatus: null };
    });
    let name = r.name, k = 2; while (recipeIdByName(name)) name = r.name + ' ' + k++;
    const id = newRecipeId(), groups = [...new Set(r.categories.filter(c => c.length <= 40).slice(0, 4).map(c => createGroup(c)).filter(Boolean))];
    const rec = { id, name, baseServings: r.servings || 4, prepMinutes: r.prep ?? null, cookMinutes: r.cook ?? null, ingredients, directions: r.steps, mealTypes: mealTypesFor(r.categories), ...(groups.length ? { groups } : {}), sourceType: 'Imported from ' + r.app, sourceUrl: r.sourceUrl || '' };
    if (r.notes) rec.notes = String(r.notes).slice(0, 4000);
    if (r.photoData && typeof storePhoto === 'function') { const small = await shrinkPhoto(r.photoData); if (small) { try { rec.photoId = await storePhoto(small); photos++ } catch (_) {} } }
    else if (r.photoUrl) rec.photoUrl = r.photoUrl;
    state.data.recipes[id] = rec;
    if (typeof convertedForSave === 'function') for (const i of ingredients) try { const c = convertedForSave(i); if (c) i.converted = c } catch (_) {}
    if (n % 25 === 0) await new Promise(res => setTimeout(res, 0));
  }
  save(); appImport = null; closeModal(); showScreen('recipes');
  toast(`✓ ${picked.length} recipe${picked.length === 1 ? '' : 's'} added${photos ? ' with ' + photos + ' photo' + (photos === 1 ? '' : 's') : ''}`);
}
