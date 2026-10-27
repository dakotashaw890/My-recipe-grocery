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
  'breakfast sausage': ['Sausages'], 'hot dogs': ['Sausages'], 'deli ham': ['Ham'], 'white fish': ['White Fish', 'Cod'],
  'heavy cream': ['Double Cream', 'Heavy Cream'], 'cilantro': ['Coriander', 'Cilantro'], 'corn': ['Sweetcorn', 'Corn'], 'cornstarch': ['Cornflour', 'Cornstarch'],
  'bell peppers': ['Red Pepper', 'Green Pepper'], 'green chilis': ['Green Chilli', 'Chilli'], 'bbq sauce': ['Barbeque Sauce', 'BBQ Sauce'],
  'beef broth': ['Beef Stock'], 'chicken broth': ['Chicken Stock'], 'bouillon cubes': ['Chicken Stock Cube', 'Stock Cube'], 'tomato bouillon': ['Stock Cube'], 'tomato boulon': ['Stock Cube'],
  'flour tortillas': ['Flour Tortilla', 'Tortillas'], 'corn tortillas': ['Corn Tortillas', 'Tortillas'], 'tomato paste': ['Tomato Puree'], 'ketchup': ['Tomato Ketchup', 'Ketchup'],
  'diced tomatoes': ['Chopped Tomatoes'], 'tomato sauce': ['Passata', 'Tomato Sauce'], 'marinara sauce': ['Passata'], 'pizza sauce': ['Passata'],
  'syrup': ['Maple Syrup'], 'sandwich bread': ['Bread'], 'french bread': ['Baguette', 'Bread'], 'buns': ['Bread Rolls', 'Burger Buns'], 'hamburger buns': ['Burger Buns', 'Bread Rolls'],
  'slider buns': ['Bread Rolls'], 'sub rolls': ['Bread Rolls'], 'english muffins': ['English Muffins', 'Muffins'], 'penne': ['Penne Rigate', 'Penne'], 'penne pasta': ['Penne Rigate', 'Penne'],
  'macaroni pasta': ['Macaroni'], 'fettuccine pasta': ['Fettuccine'], 'ziti pasta': ['Rigatoni', 'Pasta'], 'cheese tortellini': ['Tortellini'], 'egg noodles': ['Egg Noodles', 'Noodles'],
  'white rice': ['Rice', 'White Rice'], 'yellow onions': ['Onion', 'Onions'], 'russet potatoes': ['Potatoes'], 'mashed potatoes': ['Potatoes'], 'instant mashed potatoes': ['Potatoes'],
  'minced garlic': ['Garlic'], 'garlic cloves': ['Garlic Clove', 'Garlic'], 'shredded lettuce': ['Lettuce'], 'coleslaw mix': ['Cabbage'],
  'plain greek yogurt': ['Greek Yogurt'], 'ricotta cheese': ['Ricotta'], 'mozzarella cheese': ['Mozzarella', 'Mozzarella Balls'], 'shredded mozzarella cheese': ['Mozzarella'],
  'parmesan cheese': ['Parmesan', 'Parmesan Cheese'], 'shredded cheddar cheese': ['Cheddar Cheese'], 'shredded cheese': ['Cheddar Cheese'], 'shredded mexican cheese': ['Cheddar Cheese'],
  'american cheese slices': ['Cheese Slices', 'Cheese'], 'swiss cheese slices': ['Gruyère', 'Cheese'], 'swiss cheese': ['Gruyère', 'Cheese'], 'spreadable butter': ['Butter'],
  'pico de gallo': ['Salsa'], 'pico': ['Salsa'], 'taco seasoning': ['Cumin'], 'goya seasoning': ['Paprika'], 'gaya seasoning': ['Paprika'],
  'frozen mixed vegetables': ['Mixed Vegetables', 'Peas'], 'northern white beans': ['Cannellini Beans', 'Haricot Beans'], 'refried beans': ['Pinto Beans', 'Kidney Beans'],
  'refrigerated biscuits': ['Biscuits'], 'tortilla chips': ['Tortilla Chips'], 'tostada shells': ['Tortillas'],
};
const DESCRIPTORS = /^(frozen|shredded|sliced|fresh|canned|diced|minced|ground|boneless|skinless|plain|white|yellow|red|russet|instant|refrigerated|deli|smoked|spreadable|large|small|chopped|grated|crushed|dried|unsalted|salted|extra virgin)\s+/;
function photoCandidates(key) {
  const out = [...(PHOTO_ALIASES[key] || [])];
  const variants = k => [k, k.replace(/ies$/, 'y'), k.replace(/oes$/, 'o'), k.replace(/es$/, ''), k.replace(/s$/, ''), k + 's'];
  let k = key;
  for (let i = 0; i < 4; i++) { out.push(...variants(k)); const shorter = k.replace(DESCRIPTORS, ''); if (shorter === k) break; k = shorter }
  out.push(...variants(k.replace(/\s*(pasta|slices|cheese)$/, '')));
  return out;
}
function mealdbPhotoName(key) {
  if (!mealdbNames) return null;
  for (const c of photoCandidates(key)) { const hit = mealdbNames.get(String(c).toLowerCase().trim()); if (hit) return hit }
  return null;
}
function ingredientPhotoURL(key, small = true) {
  const n = mealdbPhotoName(key);
  return n ? `${MEALDB}/images/ingredients/${encodeURIComponent(n)}${small ? '-Small' : ''}.png` : null;
}
// <img onerror>: small photo -> full photo -> app illustration -> cart emoji
function pictureFailed(img) {
  const step = Number(img.dataset.step || 0) + 1; img.dataset.step = step;
  const key = img.dataset.key || '';
  if (step === 1 && img.dataset.full) { img.src = img.dataset.full; return }
  const ill = PACKAGE_PICTURES[PACKAGE_PICTURE_ALIASES[key] || key];
  if (step <= 2 && ill && img.getAttribute('src') !== ill) { img.dataset.step = 2; img.src = ill; img.classList.remove('photo'); return }
  img.replaceWith(document.createTextNode('🛒'));
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
function recipesWithoutPhotos() { return Object.keys(state.data.recipes).filter(n => !recipePhotoSrc(state.data.recipes[n])).sort() }

function openRecipePhoto(name, queue) {
  photoFlow = { name, queue: queue || null, done: photoFlow?.queue && queue ? photoFlow.done : 0 };
  const r = state.data.recipes[name]; if (!r) return;
  const cur = recipePhotoSrc(r), q = photoFlow.queue;
  closeModal();
  openModal(`<div class="row between"><h2>${q ? 'Photo for ' : ''}${esc(name)}</h2><button class="iconbtn" aria-label="Close" onclick="closeRecipePhoto()">✕</button></div>
    ${q ? `<p class="small muted">${q.length} more recipe${q.length === 1 ? '' : 's'} without a photo after this one.</p>` : ''}
    ${cur ? `<img class="recipe-photo-large" src="${esc(cur)}" alt="Current photo of ${esc(name)}">` : ''}
    <div class="actions"><button class="btn" onclick="pickRecipePhoto(true)">📷 Take photo</button><button class="btn secondary" onclick="pickRecipePhoto(false)">🖼 Choose from phone</button>${cur ? '<button class="btn ghost" onclick="removeRecipePhoto()">Remove photo</button>' : ''}</div>
    <h3>Or pick a photo of a similar dish</h3><div id="photoResults" class="photo-grid"><div class="small muted">Searching…</div></div>
    ${q ? `<div class="actions"><button class="btn secondary" onclick="nextRecipePhoto()">Skip</button><button class="btn ghost" onclick="closeRecipePhoto()">Stop</button></div>` : ''}
    <input id="recipeCamera" type="file" accept="image/*" capture="environment" hidden onchange="recipePhotoChosen(this)"><input id="recipeLibrary" type="file" accept="image/*" hidden onchange="recipePhotoChosen(this)">`);
  searchDishPhotos(name).then(list => {
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
    r.photoId = id; delete r.photoUrl; save();
    if (old && old !== id) removePhoto(old);
    toast('Recipe photo saved'); nextRecipePhoto(true);
  } catch (e) { console.error(e); alert('Couldn\'t use that picture. Try a different one.') }
}
function useDishPhoto(i) {
  const m = window.dishResults?.[i]; if (!m || !photoFlow) return;
  const r = state.data.recipes[photoFlow.name], old = r.photoId;
  r.photoUrl = m.thumb; delete r.photoId; save();
  if (old) removePhoto(old);
  toast('Photo added'); nextRecipePhoto(true);
}
function removeRecipePhoto() {
  const r = state.data.recipes[photoFlow?.name]; if (!r) return;
  const old = r.photoId; delete r.photoId; delete r.photoUrl; save(); if (old) removePhoto(old);
  openRecipePhoto(photoFlow.name);
}
function nextRecipePhoto(saved) {
  if (photoFlow?.queue?.length) { const next = photoFlow.queue.shift(); photoFlow.done += saved ? 1 : 0; openRecipePhoto(next, photoFlow.queue); return }
  const name = photoFlow?.name, wasQueue = !!photoFlow?.queue, n = (photoFlow?.done || 0) + (saved && wasQueue ? 1 : 0);
  photoFlow = null; closeModal();
  if (wasQueue) toast(n ? `Added ${n} recipe photo${n === 1 ? '' : 's'}` : 'All done');
  else if (name && state.data.recipes[name]) openRecipe(name);
}
function closeRecipePhoto() { const name = photoFlow?.queue ? null : photoFlow?.name; photoFlow = null; closeModal(); if (name) openRecipe(name) }
function startRecipePhotoFlow() { const list = recipesWithoutPhotos(); if (!list.length) return toast('Every recipe has a photo'); openRecipePhoto(list.shift(), list) }

// ---------- Settings card ----------
function renderPictureCard() {
  const box = document.getElementById('pictureCard'); if (!box) return;
  const style = pictureStyle(), missing = recipesWithoutPhotos().length;
  box.innerHTML = `<h3>Pictures</h3>
    <label>Ingredient pictures on this phone</label>
    <div class="segmented" role="group" aria-label="Ingredient pictures"><button class="${style === 'photos' ? 'on' : ''}" aria-pressed="${style === 'photos'}" onclick="setPictureStyle('photos')">Photos</button><button class="${style !== 'photos' ? 'on' : ''}" aria-pressed="${style !== 'photos'}" onclick="setPictureStyle('illustrations')">Illustrations</button></div>
    <p class="tiny muted">Photos come from TheMealDB when you're online; ingredients without a match keep their illustration. Your own photos always show first.</p>
    <div class="actions"><button class="btn secondary" onclick="startRecipePhotoFlow()" ${missing ? '' : 'disabled'}>📷 Add photos to recipes${missing ? ` (${missing} without one)` : ''}</button></div>`;
}

loadMealdbNames();
