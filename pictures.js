// Real photos for ingredients and recipes (v17).
// Ingredient photos come from TheMealDB's free ingredient images, matched by name; anything
// without a match keeps the app's illustration. Recipe photos are your own (camera / phone)
// or picked from TheMealDB dish photos. Your own photos always win.
'use strict';

const MEALDB = 'https://www.themealdb.com';
const PICTURE_STYLE_KEY = KEY + '-pictureStyle';      // 'photos' | 'illustrations' (per phone)
const MEALDB_LIST_KEY = KEY + '-mealdbIngredients';

// ---------- Ingredient photos ----------
function pictureStyle() { try { return localStorage.getItem(PICTURE_STYLE_KEY) || 'photos' } catch (_) { return 'photos' } }
function setPictureStyle(v) { try { localStorage.setItem(PICTURE_STYLE_KEY, v) } catch (_) {} refreshSavedViews(); renderPictureCard() }

let mealdbNames = null;   // normalized name -> TheMealDB's exact name
function setMealdbNames(list) { mealdbNames = new Map(list.map(n => [n.toLowerCase().trim(), n])) }
function loadMealdbNames() {
  let fresh = false;
  try {
    const c = JSON.parse(localStorage.getItem(MEALDB_LIST_KEY));
    if (c?.names?.length) { setMealdbNames(c.names); fresh = Date.now() - c.at < 30 * 864e5 }
  } catch (_) {}
  if (fresh) return;
  fetch(MEALDB + '/api/json/v1/1/list.php?i=list').then(r => r.json()).then(d => {
    const names = (d.meals || []).map(m => m.strIngredient).filter(Boolean);
    if (names.length < 50) return;
    try { localStorage.setItem(MEALDB_LIST_KEY, JSON.stringify({ at: Date.now(), names })) } catch (_) {}
    setMealdbNames(names); refreshSavedViews();
  }).catch(() => {});
}

// US kitchen names -> names TheMealDB uses (tried in order; only used if TheMealDB has them)
const PHOTO_ALIASES = {
  'ground beef': ['Minced Beef', 'Beef'], 'ground turkey': ['Turkey Mince', 'Minced Turkey'], 'stew beef': ['Stewing Beef', 'Beef'], 'beef chuck roast': ['Beef Brisket', 'Beef'],
  'boneless skinless chicken breasts': ['Chicken Breasts', 'Chicken Breast', 'Chicken'], 'pork butt': ['Pork Shoulder', 'Pork'], 'smoked sausage': ['Smoked Sausage', 'Sausages'],
  'breakfast sausage': ['Sausages'], 'deli ham': ['Ham'], 'white fish': ['White Fish', 'Cod'],
  'heavy cream': ['Double Cream', 'Heavy Cream'], 'cilantro': ['Coriander', 'Cilantro'], 'corn': ['Sweetcorn', 'Corn'], 'cornstarch': ['Cornflour', 'Cornstarch'],
  'bell peppers': ['Red Pepper', 'Green Pepper'], 'green chilis': ['Green Chilli', 'Chilli'], 'bbq sauce': ['Barbeque Sauce', 'BBQ Sauce'],
  'beef broth': ['Beef Stock'], 'chicken broth': ['Chicken Stock'], 'bouillon cubes': ['Chicken Stock Cube', 'Stock Cube'], 'tomato bouillon': ['Stock Cube'], 'tomato boulon': ['Stock Cube'],
  'flour tortillas': ['Flour Tortilla', 'Tortillas'], 'corn tortillas': ['Corn Tortillas', 'Tortillas'], 'tomato paste': ['Tomato Puree'], 'ketchup': ['Tomato Ketchup', 'Ketchup'],
  'diced tomatoes': ['Chopped Tomatoes'], 'tomato sauce': ['Passata', 'Tomato Sauce'],   'syrup': ['Maple Syrup'], 'sandwich bread': ['Bread'], 'french bread': ['Baguette', 'Bread'], 'buns': ['Bread Rolls', 'Burger Buns'], 'hamburger buns': ['Burger Buns', 'Bread Rolls'],
  'slider buns': ['Bread Rolls'], 'sub rolls': ['Bread Rolls'], 'english muffins': ['English Muffins', 'Muffins'], 'penne': ['Penne Rigate', 'Penne'], 'penne pasta': ['Penne Rigate', 'Penne'],
  'macaroni pasta': ['Macaroni'], 'fettuccine pasta': ['Fettuccine'], 'ziti pasta': ['Rigatoni', 'Pasta'], 'cheese tortellini': ['Tortellini'], 'egg noodles': ['Egg Noodles', 'Noodles'],
  'white rice': ['Rice', 'White Rice'], 'yellow onions': ['Onion', 'Onions'], 'russet potatoes': ['Potatoes'], 'mashed potatoes': ['Potatoes'], 
  'minced garlic': ['Garlic'], 'garlic cloves': ['Garlic Clove', 'Garlic'], 'shredded lettuce': ['Lettuce'], 'coleslaw mix': ['Cabbage'],
  'plain greek yogurt': ['Greek Yogurt'], 'ricotta cheese': ['Ricotta'], 'mozzarella cheese': ['Mozzarella', 'Mozzarella Balls'], 'shredded mozzarella cheese': ['Mozzarella'],
  'parmesan cheese': ['Parmesan', 'Parmesan Cheese'], 'shredded cheddar cheese': ['Cheddar Cheese'], 'shredded cheese': ['Cheddar Cheese'], 'shredded mexican cheese': ['Cheddar Cheese'],
  'american cheese slices': ['Cheese Slices', 'Cheese'], 'swiss cheese slices': ['Gruyère', 'Cheese'], 'swiss cheese': ['Gruyère', 'Cheese'], 'spreadable butter': ['Butter'],
  'pico de gallo': ['Salsa'], 'pico': ['Salsa'],   'northern white beans': ['Cannellini Beans', 'Haricot Beans'],   'refrigerated biscuits': ['Biscuits'], 'tortilla chips': ['Tortilla Chips'], };
const DESCRIPTORS = /^(frozen|shredded|sliced|fresh|canned|diced|minced|ground|boneless|skinless|plain|white|yellow|red|russet|instant|refrigerated|deli|smoked|spreadable|large|small|chopped|grated|crushed|dried|unsalted|salted|extra virgin)\s+/;
const nameVariants = k => [k, k.replace(/ies$/, 'y'), k.replace(/oes$/, 'o'), k.replace(/es$/, ''), k.replace(/s$/, ''), k + 's'];
// Approximate candidates (translations and simplified names), tried after the exact name.
function photoCandidates(key) {
  const out = [...(PHOTO_ALIASES[key] || [])];
  const variants = nameVariants;
  let k = key;
  for (let i = 0; i < 4; i++) { out.push(...variants(k)); const shorter = k.replace(DESCRIPTORS, ''); if (shorter === k) break; k = shorter }
  out.push(...variants(k.replace(/\s*(pasta|slices|cheese)$/, '')));
  return out;
}
// {name, exact}: exact = TheMealDB has this very ingredient (allowing plural/singular)
function mealdbMatch(key) {
  if (!mealdbNames) return null;
  for (const c of nameVariants(key)) { const hit = mealdbNames.get(c); if (hit) return { name: hit, exact: true } }
  for (const c of photoCandidates(key)) { const hit = mealdbNames.get(String(c).toLowerCase().trim()); if (hit) return { name: hit, exact: false } }
  return null;
}
function mealdbPhotoName(key) { return mealdbMatch(key)?.name || null }
function illustrationFor(key) { return PACKAGE_PICTURES[PACKAGE_PICTURE_ALIASES[key] || key] || null }
const mealdbImage = (name, small = true) => `${MEALDB}/images/ingredients/${encodeURIComponent(name)}${small ? '-Small' : ''}.png`;
// Order of preference: an exact photo, then the app's illustration, then a photo of something similar.
function ingredientPhotoURL(key, small = true) {
  const m = mealdbMatch(key);
  if (!m || (!m.exact && illustrationFor(key))) return null;
  return mealdbImage(m.name, small);
}
const DEPARTMENT_ICONS = { 'Produce': '🥬', 'Meat & Seafood': '🥩', 'Dairy & Refrigerated': '🧀', 'Bakery': '🍞', 'Pantry & Canned': '🥫', 'Frozen': '🧊', 'Household': '🧻' };
function departmentIcon(key) { try { return DEPARTMENT_ICONS[departmentFor(key)] || '🛒' } catch (_) { return '🛒' } }
// <img onerror>: small photo -> full photo -> app illustration -> cart emoji
function pictureFailed(img) {
  const step = Number(img.dataset.step || 0) + 1; img.dataset.step = step;
  const key = img.dataset.key || '';
  if (step === 1 && img.dataset.full) { img.src = img.dataset.full; return }
  const ill = PACKAGE_PICTURES[PACKAGE_PICTURE_ALIASES[key] || key];
  if (step <= 2 && ill && img.getAttribute('src') !== ill) { img.dataset.step = 2; img.src = ill; img.classList.remove('photo'); return }
  img.replaceWith(document.createTextNode(departmentIcon(key)));
}

// ---------- Recipe photos ----------
function recipePhotoSrc(r) {
  if (!r) return '';
  if (r.photoId && window.photoCache?.[r.photoId]) return photoCache[r.photoId];
  return /^https:\/\//i.test(r.photoUrl || '') ? r.photoUrl : '';
}
async function compressImage(file, max = 1000, quality = .72) {
  const image = await createImageBitmap(file), ratio = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
  return canvas.toDataURL('image/jpeg', quality);
}
let photoFlow = null;   // {name, queue?:[names], done?:n}
function recipesWithoutPhotos() { return Object.keys(state.data.recipes).filter(n => !recipePhotoSrc(state.data.recipes[n])).sort((a, b) => recipeName(a).localeCompare(recipeName(b))) }

function openRecipePhoto(name, queue) {
  photoFlow = { name, queue: queue || null, done: photoFlow?.queue && queue ? photoFlow.done : 0 };
  const r = state.data.recipes[name]; if (!r) return;
  const cur = recipePhotoSrc(r), q = photoFlow.queue;
  closeModal();
  openModal(`<div class="row between"><h2>${q ? 'Photo for ' : ''}${esc(r.name)}</h2><button class="iconbtn" aria-label="Close" onclick="closeRecipePhoto()">✕</button></div>
    ${q ? `<p class="small muted">${q.length} more recipe${q.length === 1 ? '' : 's'} without a photo after this one.</p>` : ''}
    ${cur ? recipePhotoHTML(r, 'recipe-photo-large') : ''}
    <div class="actions"><button class="btn" onclick="pickRecipePhoto(true)">📷 Take photo</button><button class="btn secondary" onclick="pickRecipePhoto(false)">🖼 Choose from phone</button>${cur ? `<button class="btn secondary" onclick="openRecipeCrop(decodeURIComponent('${encId(name)}'))">✂️ Crop &amp; zoom</button><button class="btn ghost" onclick="removeRecipePhoto()">Remove photo</button>` : ''}</div>
    <h3>Or pick a photo of a similar dish</h3><div id="photoResults" class="photo-grid"><div class="small muted">Searching…</div></div>
    ${q ? `<div class="actions"><button class="btn secondary" onclick="nextRecipePhoto()">Skip</button><button class="btn ghost" onclick="closeRecipePhoto()">Stop</button></div>` : ''}
    <input id="recipeCamera" type="file" accept="image/*" capture="environment" hidden onchange="recipePhotoChosen(this)"><input id="recipeLibrary" type="file" accept="image/*" hidden onchange="recipePhotoChosen(this)">`);
  searchDishPhotos(r.name).then(list => {
    const box = document.getElementById('photoResults'); if (!box || photoFlow?.name !== name) return;
    box.innerHTML = list.length ? list.map((m, i) => `<button class="photo-choice" onclick="useDishPhoto(${i})" aria-label="Use photo of ${esc(m.name)}"><img src="${esc(m.thumb)}/preview" alt="" loading="lazy" onerror="this.src='${esc(m.thumb)}'"><span>${esc(m.name)}</span></button>`).join('')
      : '<div class="small muted">No similar dishes found online. Take or choose a photo instead.</div>';
    window.dishResults = list;
  }).catch(() => { const box = document.getElementById('photoResults'); if (box) box.innerHTML = '<div class="small muted">Couldn\'t search for photos (offline?). Take or choose a photo instead.</div>' });
}
const SEARCH_SKIP = /^(and|with|the|easy|best|ever|homemade|grandma'?s|mom'?s|crock|pot|slow|cooker|instant|sheet|pan|one|quick|simple|my|our|family|style|recipe|&)$/i;
async function searchDishPhotos(name) {
  const tries = [name], words = name.replace(/[^\w\s']/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !SEARCH_SKIP.test(w)).sort((a, b) => b.length - a.length);
  tries.push(...words.slice(0, 3));
  const seen = new Set(), out = [];
  for (const q of tries) {
    if (out.length >= 9) break;
    const d = await fetch(`${MEALDB}/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`).then(r => r.json());
    for (const m of d.meals || []) if (m.strMealThumb && !seen.has(m.idMeal)) { seen.add(m.idMeal); out.push({ name: m.strMeal, thumb: m.strMealThumb }) }
  }
  return out.slice(0, 9);
}
function pickRecipePhoto(camera) { document.getElementById(camera ? 'recipeCamera' : 'recipeLibrary')?.click() }
async function recipePhotoChosen(input) {
  const file = input.files?.[0]; input.value = '';
  if (!file || !photoFlow) return;
  try {
    const data = await compressImage(file);
    await window.photosReady;
    const r = state.data.recipes[photoFlow.name], old = r.photoId;
    let id = null;
    try { id = await storePhoto(data) } catch (_) {}
    if (!id) return alert('Couldn\'t save the photo on this phone. Try freeing some storage.');
    r.photoId = id; delete r.photoUrl; delete r.photoCrop; save();
    if (old && old !== id) removePhoto(old);
    toast('Recipe photo saved'); nextRecipePhoto(true);
  } catch (e) { console.error(e); alert('Couldn\'t use that picture. Try a different one.') }
}
function useDishPhoto(i) {
  const m = window.dishResults?.[i]; if (!m || !photoFlow) return;
  const r = state.data.recipes[photoFlow.name], old = r.photoId;
  r.photoUrl = m.thumb; delete r.photoId; delete r.photoCrop; save();
  if (old) removePhoto(old);
  toast('Photo added'); nextRecipePhoto(true);
}
function removeRecipePhoto() {
  const r = state.data.recipes[photoFlow?.name]; if (!r) return;
  const old = r.photoId; delete r.photoId; delete r.photoUrl; delete r.photoCrop; save(); if (old) removePhoto(old);
  openRecipePhoto(photoFlow.name);
}
function nextRecipePhoto(saved) {
  if (saved && photoFlow && !photoFlow.queue) { const id = photoFlow.name; photoFlow = null; openRecipeCrop(id); return }
  if (photoFlow?.queue?.length) { const next = photoFlow.queue.shift(); photoFlow.done += saved ? 1 : 0; openRecipePhoto(next, photoFlow.queue); return }
  const name = photoFlow?.name, wasQueue = !!photoFlow?.queue, n = (photoFlow?.done || 0) + (saved && wasQueue ? 1 : 0);
  photoFlow = null; closeModal();
  if (wasQueue) toast(n ? `Added ${n} recipe photo${n === 1 ? '' : 's'}` : 'All done');
  else if (name && state.data.recipes[name]) openRecipe(name);
}
function closeRecipePhoto() { const name = photoFlow?.queue ? null : photoFlow?.name; photoFlow = null; closeModal(); if (name) openRecipe(name) }
function startRecipePhotoFlow() { const list = recipesWithoutPhotos(); if (!list.length) return toast('Every recipe has a photo'); openRecipePhoto(list.shift(), list) }

// ---------- Choosing a picture for an ingredient ----------
const OFF_SEARCH = 'https://us.openfoodfacts.org/cgi/search.pl';
function hasRealPicture(key) {
  const m = state.itemMeta?.[key];
  if (m?.photoId && window.photoCache?.[m.photoId]) return true;
  if (/^(https:\/\/|data:image\/)/i.test(m?.imageUrl || '')) return true;
  if (illustrationFor(key)) return true;
  return pictureStyle() === 'photos' && !!mealdbMatch(key);
}
function ingredientsInUse() {
  const keys = new Set();
  for (const r of Object.values(state.data.recipes || {})) for (const i of r.ingredients || []) if (i?.name) keys.add(ingredientKey(i.name));
  for (const k of [...Object.keys(state.pantry || {}), ...Object.keys(state.packagePrefs || {})]) keys.add(ingredientKey(k));
  keys.delete('');
  return [...keys];
}
function ingredientsWithoutPictures() { return ingredientsInUse().filter(k => !hasRealPicture(k)).sort() }
const singular = w => w.replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/(ch|sh|x|ss)es$/, '$1').replace(/s$/, '');
function mealdbSuggestions(key) {
  if (!mealdbNames) return [];
  const want = new Set(key.split(/\s+/).map(singular).filter(w => w.length > 2));
  if (!want.size) return [];
  const scored = [];
  for (const name of new Set(mealdbNames.values())) {
    const words = name.toLowerCase().split(/\s+/).map(singular), shared = words.filter(w => want.has(w)).length;
    if (shared) scored.push([shared / Math.max(words.length, want.size), name]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].length - b[1].length).slice(0, 6)
    .map(([score, name]) => ({ thumb: mealdbImage(name), full: mealdbImage(name, false), label: name, close: score >= 0.99 }));
}
async function productSuggestions(key) {
  const q = `${OFF_SEARCH}?search_terms=${encodeURIComponent(key)}&search_simple=1&action=process&json=1&page_size=15&fields=product_name,brands,image_front_small_url,image_front_url`;
  const d = await fetch(q).then(r => r.json());
  return (d.products || []).filter(p => p.image_front_small_url).slice(0, 6).map(p => ({
    thumb: p.image_front_small_url, full: p.image_front_url || p.image_front_small_url,
    label: [String(p.brands || '').split(',')[0].trim(), p.product_name].filter(Boolean).join(' · ') || 'Product photo'
  }));
}
let pictureFlow = null;         // {queue:[keys], current, total, saved}
let pictureChoices = [];
function renderIngredientPictureExtras(key) {
  const note = document.getElementById('photoFlowNote'), grid = document.getElementById('photoSuggest'), bar = document.getElementById('photoFlowBar');
  if (!grid) return;
  const inFlow = pictureFlow?.current === key;
  if (note) note.textContent = inFlow ? `${pictureFlow.total - pictureFlow.queue.length} of ${pictureFlow.total} without a picture` : '';
  if (bar) bar.innerHTML = inFlow ? '<button class="btn secondary" onclick="skipIngredientPicture()">Skip</button><button class="btn ghost" onclick="stopIngredientPictures()">Stop</button>' : '';
  const named = mealdbSuggestions(key), close = named.filter(s => s.close), loose = named.filter(s => !s.close).slice(0, 3);
  pictureChoices = [...close, ...loose];
  const draw = (extra) => {
    if (photoTarget !== key) return;
    grid.innerHTML = pictureChoices.length ? pictureChoices.map((s, i) => `<button class="photo-choice" onclick="useIngredientPicture(${i})" aria-label="Use ${esc(s.label)}"><img src="${esc(s.thumb)}" alt="" loading="lazy" onerror="this.closest('button').remove()"><span>${esc(s.label)}</span></button>`).join('') + (extra || '')
      : (extra || '<div class="small muted">No suggestions found. Take or choose a photo instead.</div>');
  };
  draw('<div class="small muted">Looking for product photos…</div>');
  productSuggestions(key).then(list => { pictureChoices = [...close, ...list, ...loose]; draw(pictureChoices.length ? '<div class="tiny muted">Product photos: Open Food Facts (CC BY-SA)</div>' : '') })
    .catch(() => draw('<div class="tiny muted">Product photos need an internet connection.</div>'));
}
function useIngredientPicture(i) {
  const s = pictureChoices[i], key = photoTarget;
  if (!s || !key) return;
  state.itemMeta ??= {};
  const prev = state.itemMeta[key] || {}, next = { ...prev, imageUrl: s.full };
  delete next.photoId; state.itemMeta[key] = next;
  save();
  if (prev.photoId) removePhoto(prev.photoId);
  closeIngredientPhoto(); toast('Picture saved');
  ingredientPictureSaved(key);
}
function ingredientPictureSaved(key) { if (pictureFlow && pictureFlow.current === key) { pictureFlow.saved++; nextIngredientPicture() } }
function startIngredientPictures(keys) {
  const list = (keys || ingredientsWithoutPictures()).filter(k => !hasRealPicture(k));
  if (!list.length) return toast('Every ingredient has a picture');
  closeModal();
  pictureFlow = { queue: list, total: list.length, saved: 0, current: null };
  nextIngredientPicture();
}
function nextIngredientPicture() {
  const k = pictureFlow?.queue.shift();
  if (!k) { const n = pictureFlow?.saved || 0; pictureFlow = null; closeIngredientPhoto(); toast(n ? `Added ${n} picture${n === 1 ? '' : 's'}` : 'All done'); refreshSavedViews(); renderPictureCard(); return }
  pictureFlow.current = k;
  editIngredientPhoto(encId(k));
}
function skipIngredientPicture() { nextIngredientPicture() }
function stopIngredientPictures() { const n = pictureFlow?.saved || 0; pictureFlow = null; closeIngredientPhoto(); if (n) toast(`Added ${n} picture${n === 1 ? '' : 's'}`); renderPictureCard() }

// After saving a recipe: offer pictures for its ingredients that have none.
function promptMissingPictures(names) {
  const keys = [...new Set((names || []).map(ingredientKey))].filter(k => k && !hasRealPicture(k));
  if (keys.length) actionToast(`${keys.length} ingredient${keys.length === 1 ? ' has' : 's have'} no picture`, 'Add pictures', () => startIngredientPictures(keys));
}
function actionToast(text, label, fn) {
  document.getElementById('actionToast')?.remove();
  const el = document.createElement('div'); el.id = 'actionToast'; el.className = 'action-toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(text)}</span><button class="btn">${esc(label)}</button><button class="iconbtn" aria-label="Dismiss">✕</button>`;
  el.querySelector('.btn').onclick = () => { el.remove(); fn() };
  el.querySelector('.iconbtn').onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

// ---------- Settings card ----------
function renderPictureCard() {
  const box = document.getElementById('pictureCard'); if (!box) return;
  const style = pictureStyle(), missing = recipesWithoutPhotos().length, missingIng = ingredientsWithoutPictures().length;
  box.innerHTML = `<h3>Pictures</h3>
    <label>Ingredient pictures on this phone</label>
    <div class="segmented" role="group" aria-label="Ingredient pictures"><button class="${style === 'photos' ? 'on' : ''}" aria-pressed="${style === 'photos'}" onclick="setPictureStyle('photos')">Photos</button><button class="${style !== 'photos' ? 'on' : ''}" aria-pressed="${style !== 'photos'}" onclick="setPictureStyle('illustrations')">Illustrations</button></div>
    <p class="tiny muted">Photos come from TheMealDB when you're online; ingredients without a match keep their illustration. Your own photos always show first.</p>
    <div class="actions"><button class="btn secondary" onclick="startIngredientPictures()" ${missingIng ? '' : 'disabled'}>🥕 Add pictures to ingredients${missingIng ? ` (${missingIng} without one)` : ''}</button>
    <button class="btn secondary" onclick="startRecipePhotoFlow()" ${missing ? '' : 'disabled'}>📷 Add photos to recipes${missing ? ` (${missing} without one)` : ''}</button></div>
    <p class="tiny muted">Product photos come from Open Food Facts (CC BY-SA).</p>`;
}

loadMealdbNames();

// ---------- Recipe photo crop and zoom (Cropper.js, bundled) ----------
// The original photo is never changed. Only the crop is saved, as fractions of the image
// ({x, y, w, h} from 0 to 1), so it can be adjusted again later at any time.
const RECIPE_PHOTO_ASPECT = 2;   // width ÷ height of recipe cards and the recipe header
function recipePhotoHTML(r, cls = 'recipe-photo') {
  const src = recipePhotoSrc(r);
  if (!src) return '';
  const c = r.photoCrop;
  const valid = c && [c.x, c.y, c.w, c.h].every(n => Number.isFinite(n)) && c.w > 0 && c.h > 0;
  const style = valid ? `width:${(100 / c.w).toFixed(3)}%;left:${(-c.x / c.w * 100).toFixed(3)}%;top:${(-c.y / c.h * 100).toFixed(3)}%` : '';
  return `<div class="${cls}${valid ? ' cropped' : ''}"><img src="${esc(src)}" alt="${esc(r.name || '')}" loading="lazy" ${style ? `style="${style}"` : ''} onerror="this.parentElement.remove()"></div>`;
}
let cropperReady = null;
function loadCropper() {
  cropperReady ??= new Promise((resolve, reject) => {
    if (window.Cropper) return resolve();
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'cropper.min.css?v=1.6.2'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = 'cropper.min.js?v=1.6.2'; js.onload = () => resolve(); js.onerror = () => { cropperReady = null; reject(new Error('Cropper failed to load')) };
    document.head.appendChild(js);
  });
  return cropperReady;
}
let activeCropper = null;
async function openRecipeCrop(id) {
  const r = state.data.recipes[id], src = recipePhotoSrc(r);
  if (!r || !src) return;
  try { await loadCropper() } catch (_) { return alert('The crop tool couldn\'t load. Check your connection and try again.') }
  closeModal();
  openModal(`<div class="row between"><h2>Crop photo</h2><button class="iconbtn" aria-label="Close" onclick="closeRecipeCrop(false)">✕</button></div>
    <p class="small muted">Drag to move, pinch or use the buttons to zoom. The frame matches how the photo appears on the recipe card.</p>
    <div class="crop-wrap"><img id="cropImg" src="${esc(src)}" alt="${esc(r.name)}"></div>
    <div class="actions crop-tools"><button class="btn secondary" aria-label="Zoom out" onclick="activeCropper?.zoom(-0.15)">−</button><button class="btn secondary" aria-label="Zoom in" onclick="activeCropper?.zoom(0.15)">＋</button><button class="btn secondary" onclick="activeCropper?.reset()">Reset</button></div>
    <div class="actions"><button class="btn" onclick="saveRecipeCrop('${encId(id)}')">Save crop</button><button class="btn secondary" onclick="closeRecipeCrop(false)">Cancel</button></div>`);
  window.cropRecipeId = id;
  const img = document.getElementById('cropImg'), saved = r.photoCrop;
  activeCropper = new Cropper(img, {
    aspectRatio: RECIPE_PHOTO_ASPECT, viewMode: 1, dragMode: 'move', autoCropArea: 1,
    checkCrossOrigin: false, checkOrientation: false, rotatable: false, scalable: false,
    guides: false, background: false, toggleDragModeOnDblclick: false, cropBoxMovable: true, cropBoxResizable: true,
    ready() {
      if (!saved) return;
      const d = this.cropper.getImageData();
      this.cropper.setData({ x: saved.x * d.naturalWidth, y: saved.y * d.naturalHeight, width: saved.w * d.naturalWidth, height: saved.h * d.naturalHeight });
    }
  });
}
function saveRecipeCrop(encoded) {
  const id = decodeURIComponent(encoded), r = state.data.recipes[id];
  if (!r || !activeCropper) return;
  const d = activeCropper.getData(), img = activeCropper.getImageData();
  const clamp = v => Math.min(1, Math.max(0, v));
  const w = clamp(d.width / img.naturalWidth), h = clamp(d.height / img.naturalHeight);
  r.photoCrop = { x: clamp(d.x / img.naturalWidth), y: clamp(d.y / img.naturalHeight), w, h };
  save(); closeRecipeCrop(true); toast('Crop saved');
}
function closeRecipeCrop(saved) {
  const id = window.cropRecipeId;
  try { activeCropper?.destroy() } catch (_) {}
  activeCropper = null; window.cropRecipeId = null;
  closeModal();
  if (id && state.data.recipes[id]) openRecipe(id);
}
