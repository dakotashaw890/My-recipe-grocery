// Gingham: the main app (screens, recipes, planner, shopping, pantry).
// Loaded after units/groups/planner/family/cooking/shop.js; sync, storage and the rest load after it.
// V9: apply only to ingredients that still exactly match the user's exported snapshot.
async function loadScriptOnce(src){window.loadedScripts??={};return window.loadedScripts[src]??=new Promise((res,rej)=>{const el=document.createElement('script');el.src=src;el.onload=res;el.onerror=()=>{delete window.loadedScripts[src];rej(new Error('Could not load '+src))};document.head.appendChild(el)})}
async function applyV9Corrections(){
 try{await loadScriptOnce('v9-corrections.js?v=24')}catch(e){return alert('The corrections couldn\'t download. Check your connection and try again.')}
 const V9_CORRECTIONS=window.V9_CORRECTIONS||{};
 if(!await ask('Apply reviewed corrections to matching ingredients? First export a fresh backup. Your later edits and other family data are preserved.'))return;
 let applied=0,skipped=0;
 for(const [name,changes] of Object.entries(V9_CORRECTIONS)){
  const r=state.data.recipes[recipeIdByName(name)];if(!r){skipped+=changes.length;continue;}
  for(const change of changes){const current=r.ingredients[change.index];if(!current||current.name!==change.old.name){skipped++;continue;}
   // Only overwrite fields that still match the uploaded snapshot, not later user edits.
   let did=false;for(const field of ['qty','unit','recipeQty','recipeUnit','container','containerSize','fraction','catalog','auditStatus']){
    if(JSON.stringify(current[field]??null)===JSON.stringify(change.old[field]??null)&&JSON.stringify(change.old[field]??null)!==JSON.stringify(change.new[field]??null)){
     current[field]=change.new[field];did=true;
    }else if(JSON.stringify(change.old[field]??null)!==JSON.stringify(change.new[field]??null))skipped++;
   }if(did)applied++;
  }
 }
 state.auditVersion=9;save();alert('Version 9: '+applied+' ingredient records updated. '+skipped+' changed fields skipped to protect newer edits. See separate review CSV for ambiguous recipes.');
}
const BUDGET_PRICE_BY_NAME={"milk":3.8,"eggs":3.2,"ground beef":6.2,"chicken":4.5,"boneless skinless chicken breasts":4.5,"butter":4.8,"rice":3.2,"shredded cheese":4.5,"potatoes":4.8,"bread":2.5,"flour":3.4,"bacon":5.8,"olive oil":6.8,"tomato paste":1.2,"chicken broth":2.3,"beef broth":2.4};
function budgetEstimate(k){const key=k.toLowerCase().trim(),p=displayPackage(key);if(!p)return null;let base=BUDGET_PRICE_BY_NAME[key];if(base==null){const d=departmentFor(key);base={'Produce':2.5,'Meat & Seafood':5.5,'Dairy & Refrigerated':3.5,'Bakery':3.2,'Frozen':3.8,'Pantry & Canned':2.6,'Other / Uncategorized':3.0}[d]}return base??null}
function effectivePrice(k){const m=state.itemMeta?.[k];if(m?.price!=null&&Number.isFinite(Number(m.price)))return {value:Number(m.price),source:m.priceSource==='auto'?'Automatic':m.priceSource==='paid'?'Last paid':'Manual'};const estimate=budgetEstimate(k);return estimate==null?null:{value:estimate,source:'Estimate'}}
function priceBadge(k){const m=state.itemMeta?.[k];if(m?.price==null)return 'Price unavailable';return m.priceSource==='auto'?'Auto price':'Manual price';}
async function clearManualPrices(){const entries=Object.entries(state.itemMeta||{}).filter(([k,v])=>v.price!=null&&v.priceSource!=='auto');if(!entries.length)return toast('No manual prices to clear');if(!await ask('Clear '+entries.length+' manually entered prices? Package sizes and purchase history stay unchanged.'))return;for(const [k,m] of entries){m.price=m.autoPrice??null;m.priceSource=m.autoPrice!=null?'auto':null;m.priceUpdatedAt=m.autoPrice!=null?m.autoUpdatedAt:null;}save();toast('Manual prices cleared');}
// Swiping between screens lives in extras.js (v17).
const KEY='recipe-grocery-state-v1';
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MEALS=['Breakfast','Lunch','Dinner'];
let state=loadState();
let recipeFilter='all';

function clone(x){return JSON.parse(JSON.stringify(x))}
// Recipes are stored under a permanent id; the name is only for display and can change freely.
// Ids for existing recipes come from their name (same result on every phone, so sync stays consistent).
function stableRecipeId(name){let h1=0xdeadbeef,h2=0x41c6ce57;const s=String(name).trim();for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return 'r-'+(4294967296*(2097151&h2)+(h1>>>0)).toString(36)}
function newRecipeId(){return 'r-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function recipeName(id){return state?.data?.recipes?.[id]?.name||String(id||'')}
function recipeIdByName(name,s=state){const n=String(name||'').trim().toLowerCase();return Object.keys(s.data.recipes||{}).find(id=>String(s.data.recipes[id]?.name||'').trim().toLowerCase()===n)||null}
function recipeIdsSorted(){return Object.keys(state.data.recipes).sort((a,b)=>recipeName(a).localeCompare(recipeName(b)))}
// Converts any recipes still keyed by name (older data, backups, or a phone that hasn't updated yet).
// Safe to run any number of times. Returns true if anything changed.
function ensureRecipeIds(s){
 const recipes=s?.data?.recipes;if(!recipes)return false;
 const map={},out={};let changed=false;
 for(const [key,r] of Object.entries(recipes)){
  if(!r||typeof r!=='object')continue;
  if(r.id&&key===r.id&&!out[key]){out[key]=r;continue}
  const name=String(r.name||key).trim()||key;let id=r.id&&!out[r.id]?r.id:stableRecipeId(name);
  if(out[id])id=stableRecipeId(name+'#'+key);
  out[id]={...r,id,name};map[key]=id;changed=true;
 }
 const byName={};for(const [id,r] of Object.entries(out))byName[String(r.name).trim().toLowerCase()]??=id;
 const m=k=>map[k]||(out[k]?k:byName[String(k||'').trim().toLowerCase()]||k);
 const fav=[...new Set((s.favorites||[]).map(m))];if(JSON.stringify(fav)!==JSON.stringify(s.favorites||[])){s.favorites=fav;changed=true}
 const sel={};for(const [k,v] of Object.entries(s.selected||{})){const id=m(k);sel[id]=(sel[id]||0)+Number(v||0)}if(JSON.stringify(sel)!==JSON.stringify(s.selected||{})){s.selected=sel;changed=true}
 for(const v of Object.values(s.plan||{}))if(v?.recipe&&m(v.recipe)!==v.recipe){v.recipe=m(v.recipe);changed=true}
 for(const x of s.pantryHistory||[])if(x?.recipe&&m(x.recipe)!==x.recipe){x.recipe=m(x.recipe);changed=true}
 if(changed){s.data.recipes=out;try{localStorage.setItem(KEY+'-recipeIdUpgrade',String(Date.now()))}catch(_){}}
 return changed;
}
function freshState(){const data={recipes:{},ingredients:{}};return {welcome:true,data,favorites:[],plan:{},checks:{},selected:{},packagePrefs:{},ingredientConversions:{},recipeGroups:{},planPrefs:{},people:{},ratings:{},stores:{},deletedIngredients:[],schemaVersion:schemaMigrations().slice(-1)[0].version,migrations:{removedShellTypo:true},starterVersion:3}}
// Ordered, individually guarded migrations. A failing migration is logged and skipped;
// it never causes saved data to be replaced.
function schemaMigrations(){return [
 {version:1,run(s){ // add starter recipes the user does not already have
  if(!s.starterVersion||s.starterVersion<3){Object.entries(STARTER_RECIPES).forEach(([name,recipe])=>{if(!s.data.recipes[name])s.data.recipes[name]=clone(recipe)});s.starterVersion=3}
 }},
 {version:2,run(s){ // remove the malformed "she'll noodle(s)" ingredient everywhere
  if(s.migrations?.removedShellTypo)return;
  const badNames=new Set(["she'll noodle","she'll noodles","she’ll noodle","she’ll noodles"]);
  const norm=v=>String(v||'').toLowerCase().trim();
  const isBad=v=>badNames.has(norm(v));
  for(const recipe of Object.values(s.data?.recipes||{}))if(Array.isArray(recipe.ingredients))recipe.ingredients=recipe.ingredients.filter(i=>!isBad(i?.name));
  for(const objName of ['pantry','packagePrefs','itemMeta','ingredientConversions']){const obj=s[objName];if(obj&&typeof obj==='object')for(const k of Object.keys(obj))if(isBad(k)||[...badNames].some(n=>norm(k).startsWith(n+'|')))delete obj[k]}
  for(const [code,v] of Object.entries(s.barcodeLinks||{}))if(isBad(v)||isBad(v?.name))delete s.barcodeLinks[code];
  for(const k of Object.keys(s.checks||{}))if(isBad(k))delete s.checks[k];
  s.migrations??={};s.migrations.removedShellTypo=true;
 }}
]}
function loadState(){
  const MIGRATIONS=schemaMigrations(),SCHEMA_VERSION=MIGRATIONS[MIGRATIONS.length-1].version;
  const raw=localStorage.getItem(KEY);
  if(!raw)return freshState();
  let s;
  try{s=JSON.parse(raw);if(!s||!s.data?.recipes)throw new Error('Saved data has no recipes')}
  catch(e){
    // Keep the unreadable copy so nothing is lost, then start fresh and tell the user.
    const backupKey=KEY+'-unreadable-'+Date.now();
    try{localStorage.setItem(backupKey,raw)}catch(_){}
    console.error('Saved data could not be read',e);
    setTimeout(()=>alert('Your saved data could not be read, so the app started with default recipes. A copy of the old data was kept on this device under "'+backupKey+'". Use Settings → Import backup with a recent backup file, or contact the developer before making changes.'),600);
    return freshState();
  }
  s.ingredientConversions??={};s.recipeGroups??={};s.planPrefs??={};s.people??={};s.ratings??={};s.stores??={};s.deletedIngredients??=[];s.favorites??=[];s.plan??={};s.checks??={};s.selected??={};s.packagePrefs??={};
  const before=s.schemaVersion||0;
  for(const m of MIGRATIONS){
    if((s.schemaVersion||0)>=m.version)continue;
    try{m.run(s);s.schemaVersion=m.version}
    catch(e){console.error('Migration '+m.version+' failed; data left unchanged for this step',e);break}
  }
  let upgraded=false;try{upgraded=ensureRecipeIds(s)}catch(e){console.error('Recipe id upgrade failed; data left unchanged',e)}
  try{if(typeof upgradePlanToDates==='function'&&(upgradePlanToDates(s)+prunePlanHistory(s)))upgraded=true}catch(e){console.error('Plan date upgrade failed',e)}
  if((s.schemaVersion||0)!==before||upgraded){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){console.error('Could not store migrated data',e)}}
  return s;
}
function save(){
 // Storage failure must be distinguishable from rendering/sync errors.
 if(!writeState())storageFullWarning();else if(window.storageWasFull){window.storageWasFull=false;document.getElementById('storageFull')?.remove()}
 try{refreshSavedViews()}catch(error){console.error('Saved, but view refresh failed',error)}
 if(typeof onStateSaved==='function'){
  try{onStateSaved()}catch(error){console.error('Saved locally; sync or backup could not start',error)}
 }
}
// Save to the phone. If its storage is full, make room from history that isn't needed (old undo steps,
// long price histories) and try again. Returns false if it still doesn't fit.
function writeState(){
 const tryWrite=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch(e){if(!/quota/i.test(e?.name+e?.message))console.error('Save failed',e);return false}};
 if(tryWrite())return true;
 if(Array.isArray(state.pantryHistory))state.pantryHistory=state.pantryHistory.slice(-5);
 for(const m of Object.values(state.itemMeta||{}))if(Array.isArray(m?.priceHistory)&&m.priceHistory.length>8)m.priceHistory=m.priceHistory.slice(-8);
 for(const k of Object.keys(localStorage))if(/^recipe-plan-template|-recipeIdUpgrade$/.test(k))try{localStorage.removeItem(k)}catch(_){}
 return tryWrite();
}
function storageFullWarning(){
 window.storageWasFull=true;
 if(document.getElementById('storageFull'))return;
 const shared=typeof syncActive==='function'&&syncActive();
 const el=document.createElement('div');el.id='storageFull';el.className='storage-full';el.setAttribute('role','alert');
 el.innerHTML=`<b>Your phone's storage for Gingham is full.</b> ${shared?'Changes still reach your family, but this phone can\'t keep them if the app closes.':'Your last change couldn\'t be saved on this phone.'} Download a backup now (⚙️ Settings → Backup files), then free up space on the phone. <button class="btn secondary" onclick="exportData()">Download backup</button>`;
 document.querySelector('main')?.prepend(el);
}
function refreshSavedViews(){
 // This standalone build has no renderAll(); refresh only supported screens.
 const active=document.querySelector('.screen.active')?.id;
 const renderers={home:renderHome,recipes:renderRecipes,plan:renderPlanner,shopping:renderShopping,ingredients:renderIngredients,spending:renderSpending,pantry:renderPantry};
 if(active&&typeof renderers[active]==='function')renderers[active]();
}
function encId(s){return encodeURIComponent(String(s)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}
function localDate(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function num(v){let n=parseFloat(v);return Number.isFinite(n)?n:null}
function fmt(v){
  if(v===null||v===undefined||v===''||Number.isNaN(Number(v))) return '—';
  let n=Number(v); if(!Number.isFinite(n)) return String(v);
  if(Math.abs(n-Math.round(n))<1e-8)return String(Math.round(n));
  return n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',1800)}
function showScreen(id){
  if(typeof noteScreen==='function')noteScreen(id);
  document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));
  document.querySelectorAll('.navbtn').forEach(x=>x.classList.toggle('active',x.dataset.screen===(['ingredients','spending','online','settings'].includes(id)?'more':id)));
  if(id==='home')renderHome(); if(id==='recipes')renderRecipes(); if(id==='plan')renderPlanner(); if(id==='shopping')renderShopping();if(id==='ingredients')renderIngredients();if(id==='spending')renderSpending();if(id==='pantry')renderPantry();if(id==='settings'&&typeof renderSettingsExtras==='function')renderSettingsExtras();
  window.scrollTo(0,0);
}
function showSettings(){showScreen('settings')}
function closeModal(){if(packageReturn){returnToPackageEditor();return}document.getElementById('modal').classList.remove('show')}
function openModal(html){document.getElementById('sheet').innerHTML=html;document.getElementById('modal').classList.add('show')}

function recipeCard(name){
  const r=state.data.recipes[name], fav=state.favorites.includes(name);
  return `<div class="card recipe-card ${state.selected[name]?'is-selected':''}">
    ${typeof recipePhotoHTML==='function'?recipePhotoHTML(r):''}<div class="row between"><div class="grow"><h3>${esc(r.name)}</h3><span class="pill">${r.ingredients.length} ingredients</span><span class="pill">base ${r.baseServings} servings</span>${typeof recipeTimes==='function'&&recipeTimes(r).total?`<span class="pill">⏱ ${formatMinutes(recipeTimes(r).total)}</span>`:''}${typeof readinessPill==='function'?readinessPill(name):''}${typeof ratingPill==='function'?ratingPill(name):''}${(r.tags||[]).filter(Boolean).slice(0,2).map(t=>`<span class="pill">${esc(t)}</span>`).join("")}</div>
    <button class="iconbtn favorite" aria-label="${fav?'Remove from favorites':'Add to favorites'}" onclick="toggleFavorite(decodeURIComponent('${encId(name)}'))">${fav?'★':'☆'}</button></div>
    <div class="actions"><button class="btn" onclick="openRecipe(decodeURIComponent('${encId(name)}'))">View recipe</button><button class="shopping-toggle ${state.selected[name]?'on':'off'}" role="switch" aria-checked="${!!state.selected[name]}" aria-label="${state.selected[name]?'Remove':'Add'} ${esc(r.name)} ${state.selected[name]?'from':'to'} shopping" onclick="toggleRecipeSelection(decodeURIComponent('${encId(name)}'))"><span>${state.selected[name]?'Added':'Not added'}</span><span class="toggle-track"><span class="toggle-knob"></span></span></button></div>
  </div>`
}
function renderHome(){
  const reminder=document.getElementById('backupReminder');if(reminder&&typeof backupReminderHTML==='function')reminder.innerHTML=backupReminderHTML();
  const kitchen=document.getElementById('heroKitchen');if(kitchen)kitchen.textContent=(typeof syncInfo!=='undefined'&&syncInfo?.familyName)||'Your family kitchen';
  const h=new Date().getHours(),greet=document.getElementById('homeGreeting');if(greet)greet.textContent=h<11?'Good morning':h<16?'Good afternoon':'Good evening';
  // Today: what's planned, with one tap to cook it
  const today=document.getElementById('homeToday');
  if(today&&typeof todaysMeals==='function'){
    const meals=todaysMeals(),hour=new Date().getHours(),next=meals.find(m=>MEALS.indexOf(m.meal)>=(hour<10?0:hour<15?1:2))||meals[meals.length-1];
    if(next){const [key,v]=next.entries[0],r=state.data.recipes[v.recipe],more=meals.reduce((n,m)=>n+m.entries.length,0)-1;
      today.innerHTML=`<div class="card today-card">${typeof recipePhotoHTML==='function'?recipePhotoHTML(r):''}<div class="small muted">${next.meal==='Dinner'?'Tonight':esc(next.meal)+' today'}</div><h2>${esc(r.name)}</h2>${typeof timeSummaryHTML==='function'?timeSummaryHTML(r):''}
        <div class="actions"><button class="btn" onclick="openCookMode(decodeURIComponent('${encId(v.recipe)}'))">👩‍🍳 Start cooking</button><button class="btn secondary" onclick="openRecipe(decodeURIComponent('${encId(v.recipe)}'))">View recipe</button></div>
        ${more>0?`<button class="linkish" onclick="showScreen('plan')">+${more} more planned today</button>`:''}</div>`}
    else{const planned=Object.keys(state.plan||{}).filter(k=>typeof planDateOf==='function'&&planDateOf(k)>=todayISO()).length;
      today.innerHTML=`<div class="card today-card empty-today"><div class="small muted">Tonight</div><h2>Nothing planned yet</h2><p class="small muted">${planned?`${planned} meal${planned===1?'':'s'} planned later this week.`:'Plan the week and the shopping list builds itself.'}</p><div class="actions"><button class="btn" onclick="showScreen('plan')">Plan meals</button>${Object.keys(state.data.recipes).length?`<button class="btn secondary" onclick="showScreen('plan');fillPlan()">✨ Suggest meals</button>`:''}</div></div>`}
  }
  // Shopping: how much is left to buy
  const shop=document.getElementById('homeShop');
  if(shop){try{renderShopping()}catch(_){}const rows=(window.lastShoppingRows||[]).filter(r=>r.qty>1e-8),left=rows.filter(r=>!state.checks[r.name.toLowerCase()]).length;
    shop.innerHTML=rows.length?`<button class="card home-shop" onclick="showScreen('shopping')"><span class="home-shop-icon" aria-hidden="true">🛒</span><span><b>${left?`${left} thing${left===1?'':'s'} to buy`:'All bought ✓'}</b><small>${rows.length-left?`${rows.length-left} checked off · `:''}${typeof shoppingRangeText==='function'?shoppingRangeText():''}</small></span><span aria-hidden="true">›</span></button>`:''}
  const ready=document.getElementById('readyCard');if(ready&&typeof readyHomeCardHTML==='function')ready.innerHTML=readyHomeCardHTML();
  const fav=state.favorites.filter(n=>state.data.recipes[n]);
  document.getElementById('homeFavorites').innerHTML=fav.length?fav.slice(0,4).map(recipeCard).join(''):`<div class="card" style="grid-column:1/-1"><div class="empty">No favorites yet. Tap ☆ on a recipe to add one.</div></div>`;
}
function setRecipeFilter(f){if(f==='favorites'&&typeof openRecipeView==='function')return openRecipeView('favorites');recipeFilter=f;if(typeof recipeView!=='undefined'&&recipeView===null&&f!=='all')recipeView='all';renderRecipes()}
function renderRecipes(){
  const q=(document.getElementById('recipeSearch')?.value||'').toLowerCase().trim(),list=document.getElementById('recipeList'),head=document.getElementById('recipeViewHead'),filters=document.getElementById('recipeFilters');
  const grouped=typeof recipeView!=='undefined',view=grouped?recipeView:'all';
  // Group tiles: the starting view, unless searching
  if(grouped&&view===null&&!q){if(head)head.innerHTML='';if(filters)filters.hidden=true;list.innerHTML=renderGroupTiles();return}
  const scope=grouped&&view!==null?recipeViewIds(view):Object.keys(state.data.recipes);
  if(head)head.innerHTML=grouped?(view===null?`<div class="view-head"><button class="btn ghost back-groups" onclick="closeRecipeView()">← Groups</button><h2>Search results</h2></div>`:recipeViewHeader(view,scope.length)):'';
  if(filters){filters.hidden=false;filters.querySelectorAll('[data-f]').forEach(b=>{const on=b.dataset.f===recipeFilter;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)})}
  const inScope=new Set(scope);
  if(recipeFilter==='ready'){const names=readyRecipeNames(2).filter(n=>inScope.has(n)&&recipeName(n).toLowerCase().includes(q));list.innerHTML=`<div class="card small muted">Recipes you can make from your pantry, then ones missing just 1–2 items. Keep the pantry up to date for the best results.</div>`+(names.length?names.map(recipeCard).join(''):`<div class="empty">Nothing here is fully stocked yet. Add what you have under Pantry, or use Finish trip after shopping.</div>`);return}
  let names=scope.filter(n=>{const r=state.data.recipes[n],matches=recipeFilter==='all'||(recipeFilter==='favorites'&&state.favorites.includes(n))||(recipeFilter==='quick'&&r.ingredients.length<=5)||(recipeFilter==='family'&&(r.tags||[]).some(t=>/family|kid/i.test(t)));return matches&&(String(r.name||n).toLowerCase().includes(q)||(r.tags||[]).some(t=>t.toLowerCase().includes(q))||r.ingredients.some(i=>i.name.toLowerCase().includes(q)))});
  names.sort((a,b)=>recipeName(a).localeCompare(recipeName(b)));
  const empty=grouped&&state.recipeGroups?.[view]&&!scope.length?`<div class="empty">This group is empty. Tap <b>＋ Add recipes</b> to fill it, or add groups from any recipe's page.</div>`:`<div class="empty">No recipes found.</div>`;
  list.innerHTML=names.length?names.map(recipeCard).join(''):empty;
}
function toggleFavorite(name){
  state.favorites=state.favorites.includes(name)?state.favorites.filter(x=>x!==name):[...state.favorites,name];save();toast(state.favorites.includes(name)?'Added to favorites':'Removed from favorites')
}

const PACKAGE_DEFAULTS = {"hot dogs":{"qty":1,"unit":"ea.","label":"each"},"buns":{"qty":8,"unit":"ea.","label":"package"},"chili":{"qty":1,"unit":"can","label":"can"},"ground beef":{"qty":1,"unit":"lb","label":"lb"},"taco seasoning":{"qty":1,"unit":"packet","label":"packet"},"rice":{"qty":2,"unit":"lb","label":"bag"},"shredded cheese":{"qty":16,"unit":"oz","label":"bag"},"salsa":{"qty":16,"unit":"fl oz","label":"jar"},"pork butt":{"qty":1,"unit":"lb","label":"lb"},"chicken broth":{"qty":32,"unit":"fl oz","label":"carton"},"orange":{"qty":1,"unit":"ea.","label":"each"},"lime":{"qty":1,"unit":"ea.","label":"each"},"green chilis":{"qty":1,"unit":"can","label":"can"},"corn tortillas":{"qty":20,"unit":"ea.","label":"package"},"chicken":{"qty":1,"unit":"lb","label":"lb"},"bouillon cubes":{"qty":6,"unit":"ea.","label":"box"},"garlic cloves":{"qty":1,"unit":"ea.","label":"each"},"tostada shells":{"qty":20,"unit":"ea.","label":"package"},"cajita cheese":{"qty":16,"unit":"oz","label":"bag"},"northern white beans":{"qty":1,"unit":"can","label":"can"},"green enchilada sauce":{"qty":24,"unit":"fl oz","label":"jar"},"sour cream":{"qty":16,"unit":"oz","label":"tub"},"cream cheese":{"qty":16,"unit":"oz","label":"tub"},"potatoes":{"qty":5,"unit":"lb","label":"bag"},"corn":{"qty":1,"unit":"can","label":"can"},"chihuahua cheese":{"qty":16,"unit":"oz","label":"bag"},"butter":{"qty":16,"unit":"oz","label":"box"},"milk":{"qty":64,"unit":"fl oz","label":"half-gallon"},"flour":{"qty":5,"unit":"lb","label":"bag"},"eggs":{"qty":12,"unit":"ea.","label":"carton"},"brown gravy packet":{"qty":1,"unit":"packet","label":"packet"},"boneless skinless chicken breasts":{"qty":1,"unit":"lb","label":"lb"},"flour tortillas":{"qty":20,"unit":"ea.","label":"package"},"shredded mexican cheese":{"qty":16,"unit":"oz","label":"bag"},"shredded lettuce":{"qty":16,"unit":"oz","label":"bag"},"tomatoes":{"qty":1,"unit":"ea.","label":"each"},"enchilada sauce":{"qty":24,"unit":"fl oz","label":"jar"},"refried beans":{"qty":1,"unit":"can","label":"can"},"white rice":{"qty":2,"unit":"lb","label":"bag"},"cream of chicken soup":{"qty":1,"unit":"can","label":"can"},"shredded cheddar cheese":{"qty":16,"unit":"oz","label":"bag"},"bbq sauce":{"qty":18,"unit":"fl oz","label":"bottle"},"beef chuck roast":{"qty":1,"unit":"lb","label":"lb"},"beef broth":{"qty":32,"unit":"fl oz","label":"carton"},"brown gravy mix":{"qty":1,"unit":"packet","label":"packet"},"egg noodles":{"qty":16,"unit":"oz","label":"box"},"spaghetti":{"qty":16,"unit":"oz","label":"box"},"marinara sauce":{"qty":24,"unit":"fl oz","label":"jar"},"shredded mozzarella cheese":{"qty":16,"unit":"oz","label":"bag"},"ziti pasta":{"qty":16,"unit":"oz","label":"box"},"ricotta cheese":{"qty":16,"unit":"oz","label":"tub"},"macaroni pasta":{"qty":16,"unit":"oz","label":"box"},"cheddar cheese":{"qty":16,"unit":"oz","label":"bag"},"diced tomatoes":{"qty":1,"unit":"can","label":"can"},"slider buns":{"qty":8,"unit":"ea.","label":"package"},"hamburger buns":{"qty":8,"unit":"ea.","label":"package"},"fettuccine pasta":{"qty":16,"unit":"oz","label":"box"},"alfredo sauce":{"qty":24,"unit":"fl oz","label":"jar"},"parmesan cheese":{"qty":16,"unit":"oz","label":"bag"},"sub rolls":{"qty":8,"unit":"ea.","label":"package"},"carrots":{"qty":2,"unit":"lb","label":"bag"},"black beans":{"qty":1,"unit":"can","label":"can"},"russet potatoes":{"qty":5,"unit":"lb","label":"bag"},"bacon":{"qty":16,"unit":"oz","label":"package"},"refrigerated biscuits":{"qty":1,"unit":"ea.","label":"each"},"pizza sauce":{"qty":16,"unit":"fl oz","label":"jar"},"penne pasta":{"qty":16,"unit":"oz","label":"box"},"cream of mushroom soup":{"qty":1,"unit":"can","label":"can"},"bell peppers":{"qty":1,"unit":"ea.","label":"each"},"ground turkey":{"qty":1,"unit":"lb","label":"lb"},"olive oil":{"qty":16,"unit":"fl oz","label":"bottle"},"mozzarella cheese":{"qty":16,"unit":"oz","label":"bag"},"ketchup":{"qty":20,"unit":"fl oz","label":"bottle"},"mustard":{"qty":12,"unit":"fl oz","label":"bottle"},"yellow onions":{"qty":1,"unit":"ea.","label":"each"},"macaroni":{"qty":16,"unit":"oz","label":"box"},"fettuccine":{"qty":16,"unit":"oz","label":"box"},"english muffins":{"qty":8,"unit":"ea.","label":"package"},"penne":{"qty":16,"unit":"oz","label":"box"},"honey":{"qty":12,"unit":"fl oz","label":"bottle"},"soy sauce":{"qty":10,"unit":"fl oz","label":"bottle"},"white fish":{"qty":1,"unit":"lb","label":"lb"},"plain greek yogurt":{"qty":16,"unit":"oz","label":"tub"},"stew beef":{"qty":1,"unit":"lb","label":"lb"},"tomato paste":{"qty":1,"unit":"can","label":"can"}};
function normUnit(u){const a={'lbs.':'lb','lbs':'lb','pound':'lb','pounds':'lb','oz.':'oz','ounce':'oz','ounces':'oz','ea':'ea.','each':'ea.','each.':'ea.','cups':'cup','tablespoon':'tbsp','tablespoons':'tbsp','teaspoon':'tsp','teaspoons':'tsp','fluid ounce':'fl oz','fluid ounces':'fl oz','floz':'fl oz','milliliter':'ml','milliliters':'ml','liter':'l','liters':'l','grams':'g','gram':'g','kilogram':'kg','kilograms':'kg','packets':'packet','cans':'can'};u=String(u||'').trim().toLowerCase();return a[u]||(typeof EXTRA_UNIT_NAMES!=='undefined'&&EXTRA_UNIT_NAMES[u])||u}
function conversionKey(name,from,to){return String(name||'').toLowerCase().trim()+'|'+normUnit(from)+'|'+normUnit(to)}
function rememberedConversion(name,from,to){const direct=state.ingredientConversions?.[conversionKey(name,from,to)];if(direct&&Number(direct.rate)>0)return {qty:Number(direct.rate),source:'saved'};const reverse=state.ingredientConversions?.[conversionKey(name,to,from)];if(reverse&&Number(reverse.rate)>0)return {qty:1/Number(reverse.rate),source:'saved'};return null}
function compatible(q,from,to,name){if(typeof convertAmount==='function')return convertAmount(q,from,to,name);from=normUnit(from);to=normUnit(to);if(from===to)return {qty:q,estimate:false};const saved=rememberedConversion(name,from,to);if(saved)return {qty:q*saved.qty,estimate:false,remembered:true};const mass={oz:1,lb:16,g:0.03527396,kg:35.27396},vol={tsp:1,tbsp:3,cup:48,'fl oz':6,ml:0.202884,l:202.884};if(mass[from]&&mass[to])return {qty:q*mass[from]/mass[to],estimate:false};if(vol[from]&&vol[to])return {qty:q*vol[from]/vol[to],estimate:false};const densities={"shredded cheese":4,"shredded mexican cheese":4,"shredded cheddar cheese":4,"shredded mozzarella cheese":4,"mozzarella cheese":4,"cheddar cheese":4,"parmesan cheese":3.5,"rice":6.5,"white rice":6.5,"flour":4.25,"sour cream":8,"ricotta cheese":8,"plain greek yogurt":8,"cream cheese":8,"breadcrumbs":4,"frozen mixed vegetables":5,"broccoli":3,"frozen broccoli":3};const key=String(name||'').toLowerCase().trim();if(from==='cup'&&mass[to]&&densities[key])return {qty:q*densities[key]/mass[to],estimate:true};if(to==='cup'&&mass[from]&&densities[key])return {qty:q*mass[from]/densities[key],estimate:true};return null}
function getPackage(name){const key=name.toLowerCase().trim();return state.packagePrefs?.[key]||PACKAGE_DEFAULTS[key]||null}
function legacyPackage(name){const k=String(name).toLowerCase().trim();const entries=state?.data?.ingredients||{};const old=entries[k]||Object.values(entries).find(v=>v&&String(v.name||'').toLowerCase().trim()===k);if(!old)return null;const qty=Number(old.soldQty);const unit=String(old.soldUnit||'').trim(),label=String(old.container||'').trim();return qty>0&&unit&&label?{qty,unit,label}:null}
function displayPackage(name){return getPackage(name)||legacyPackage(name)}
function ingredientUses(key){const out=[];for(const [name,r] of Object.entries(state.data.recipes)){for(let idx=0;idx<r.ingredients.length;idx++){const i=r.ingredients[idx];if(i.name.toLowerCase().trim()===key)out.push({name,i,idx})}}return out}
function openIngredientInspector(initial=''){
 const keys=[...new Set(Object.values(state.data.recipes).flatMap(r=>r.ingredients.map(i=>i.name.toLowerCase().trim())))].sort();window.inspectorKeys=keys;
 openModal(`<div class="row between"><h2>🔎 Ingredient Inspector</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div><p class="muted small">Find an ingredient, see every recipe that uses it and compare recipe units to your shopping package. Open a recipe to correct its measurements.</p><input id="inspectorSearch" class="search" placeholder="Search ingredients…" value="${esc(initial)}" oninput="renderInspector()"><div id="inspectorResults"></div>`);
 renderInspector();
}
function renderInspector(){const q=document.getElementById('inspectorSearch').value.toLowerCase().trim(),keys=window.inspectorKeys.filter(k=>k.includes(q));const results=document.getElementById('inspectorResults');
 if(!q){results.innerHTML='<p class="muted small">Start typing an ingredient name to see which recipes use it.</p>';return}
 results.innerHTML=keys.slice(0,30).map(k=>{const uses=ingredientUses(k),p=getPackage(k);return `<div class="card"><div class="row between"><h3>${esc(k)}</h3><span class="pill">${uses.length} recipe${uses.length===1?'':'s'}</span></div><div class="small muted">Usual package: ${p?esc(packageText(p)):'Not set'}</div>${uses.map(({name,i})=>{const c=p?compatible(num(i.qty),i.unit,p.unit,k):null;return `<div class="inspector-entry"><b>${esc(recipeName(name))}</b><div class="small">Recipe uses: <b>${esc(i.qty)} ${esc(i.unit)}</b>${p&&c?` · Converts to ${fmt(c.qty)} ${esc(p.unit)}${c.estimate?' (estimate)':''}`:''}</div>${p&&!c?'<div class="inspector-flag">⚠ Recipe and package units do not convert automatically.</div>':''}${i.auditStatus&&i.auditStatus.startsWith('Review')?`<div class="inspector-flag">⚠ ${esc(i.auditStatus)}</div>`:''}<div class="actions"><button class="btn secondary" onclick="openRecipeEditor(decodeURIComponent('${encId(name)}'))">Edit recipe</button></div></div>`}).join('')}<button class="btn secondary" onclick="openPackageEditorFor(decodeURIComponent('${encId(k)}'))">Edit package size</button></div>`}).join('')+(keys.length>30?'<p class="small muted">Showing first 30 matching ingredients. Refine your search.</p>':'');
}
function openPackageEditorFor(key){openPackageEditor();const el=document.getElementById('pkgSearch');el.value=key;renderPackageRows()}
function openPackageEditor(){const keys=[...new Set([...Object.keys(PACKAGE_DEFAULTS),...Object.values(state.data.recipes).flatMap(r=>r.ingredients.map(i=>i.name.toLowerCase().trim()))])].sort();openModal('<div class="row between"><h2>Usual grocery package sizes</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div><p class="small muted">Set your usual package sizes. View recipes right here without losing your place; saved sizes remain editable.</p><input class="search" id="pkgSearch" placeholder="Find ingredient" oninput="renderPackageRows()"><div id="pkgRows" style="max-height:60vh;overflow:auto"></div>');window.pkgKeys=keys;renderPackageRows()}
function packageUsesHtml(k){const uses=ingredientUses(k),p=getPackage(k);return uses.length?uses.map(({name,i})=>{const c=p?compatible(num(i.qty),i.unit,p.unit,k):null;return `<div class="inspector-entry"><b>${esc(recipeName(name))}</b><div class="small">Recipe needs: <b>${esc(i.qty)} ${esc(i.unit)}</b>${p&&c?` · ${fmt(c.qty)} ${esc(p.unit)}${c.estimate?' (estimate)':''}`:''}</div>${p&&!c?'<div class="inspector-flag">⚠ Recipe and package units cannot automatically convert.</div>':''}${i.auditStatus&&i.auditStatus.startsWith('Review')?`<div class="inspector-flag">⚠ ${esc(i.auditStatus)}</div>`:''}<div class="actions"><button class="btn secondary" onclick="editRecipeFromPackage(decodeURIComponent('${encId(name)}'),decodeURIComponent('${encId(k)}'))">Edit recipe</button></div></div>`}).join(''):'<p class="small muted">No recipes currently use this ingredient.</p>'}
function togglePackageUses(id){const el=document.getElementById('pkgDetails'+id),btn=document.getElementById('pkgView'+id);if(!el)return;const opening=el.hidden;el.hidden=!opening;btn.setAttribute('aria-expanded',String(opening));btn.textContent=opening?'Hide recipes & units':'View recipes & units ('+ingredientUses(window.pkgKeys[id]).length+')';if(opening)el.innerHTML=packageUsesHtml(window.pkgKeys[id])}
function renderPackageRows(){const term=document.getElementById('pkgSearch').value.toLowerCase();const keys=window.pkgKeys.filter(k=>k.includes(term));document.getElementById('pkgRows').innerHTML=keys.map(k=>{const p=getPackage(k)||{qty:'',unit:'',label:''};const id=window.pkgKeys.indexOf(k);return `<div class="card pkg-card" id="pkgCard${id}" style="margin:6px 0"><b>${esc(k)}</b><div class="actions"><button class="btn secondary" id="pkgView${id}" aria-expanded="false" aria-controls="pkgDetails${id}" onclick="togglePackageUses(${id})">View recipes & units (${ingredientUses(k).length})</button></div><div class="pkg-details" id="pkgDetails${id}" hidden></div><div class="formrow"><div><label>Package amount</label><input id="pq${id}" type="number" min="0.001" step="any" value="${esc(p.qty)}" oninput="markPackageDirty(${id})"></div><div><label>Unit</label><input id="pu${id}" value="${esc(p.unit)}" placeholder="oz, fl oz, ea., packet" oninput="markPackageDirty(${id})"></div></div><label>Package type</label><input id="pl${id}" value="${esc(p.label)}" placeholder="bag, jar, carton" oninput="markPackageDirty(${id})"><div class="actions"><button id="pkgSave${id}" class="btn pkg-savebtn" onclick="savePackage(${id})">Save size</button></div><div id="pkgSaved${id}" class="pkg-saved" role="status" aria-live="polite">✓ Package size saved successfully</div></div>`}).join('')}
function markPackageDirty(id){const button=document.getElementById('pkgSave'+id),notice=document.getElementById('pkgSaved'+id);if(button){button.textContent='Save size';button.classList.remove('saved')}if(notice)notice.classList.remove('visible')}
function savePackage(id){const k=window.pkgKeys[id],qty=num(document.getElementById('pq'+id).value),unit=normUnit(document.getElementById('pu'+id).value),label=document.getElementById('pl'+id).value.trim();if(!qty||qty<=0||!unit||!label)return alert('Enter a positive package amount, unit and package name.');state.packagePrefs=state.packagePrefs||{};state.packagePrefs[k]={qty,unit,label};save();const btn=document.getElementById('pkgSave'+id),notice=document.getElementById('pkgSaved'+id);btn.textContent='✓ Saved';btn.classList.add('saved');notice.textContent='✓ Saved: '+fmt(qty)+' '+unit+' '+label;notice.classList.add('visible');const details=document.getElementById('pkgDetails'+id);if(details&&!details.hidden)details.innerHTML=packageUsesHtml(k);toast('Saved '+k+' package size')}
// Editing a recipe requires the recipe editor modal. Keep the package search and scroll
// position so the user returns to the same ingredient when they finish.
let packageReturn=null;
function editRecipeFromPackage(name,key){const search=document.getElementById('pkgSearch'),rows=document.getElementById('pkgRows');packageReturn={search:search?search.value:key,scroll:rows?rows.scrollTop:0,expanded:key};openRecipeEditor(name)}
function returnToPackageEditor(){const previous=packageReturn;packageReturn=null;openPackageEditor();if(previous){document.getElementById('pkgSearch').value=previous.search;renderPackageRows();const id=window.pkgKeys.indexOf(previous.expanded);if(id>=0&&document.getElementById('pkgDetails'+id))togglePackageUses(id);document.getElementById('pkgRows').scrollTop=previous.scroll}}

function ingredientFraction(i){
  if(typeof i.fraction==='number' && Number.isFinite(i.fraction) && i.fraction>0)return i.fraction;
  const c=i.catalog;
  const q=num(i.qty), cs=num(i.containerSize);
  if(q!==null&&cs!==null&&cs>0)return q/cs;
  if(c){const cq=num(i.qty), csize=num(c.unitAtSoldSize);if(cq!==null&&csize!==null&&csize>0)return cq/csize}
  return null;
}
function displayQty(i,scale){
  const q=num(i.qty);
  if(q===null)return i.qty??'';
  return fmt(q*scale);
}
function openRecipe(name){
  const r=state.data.recipes[name];if(!r)return;window.currentRecipeId=name;
  const fav=state.favorites.includes(name);
  openModal(`<div class="row between"><div><h1>${esc(r.name)}</h1><span class="pill">Base: ${r.baseServings} servings</span>${typeof timeSummaryHTML==='function'?timeSummaryHTML(r):''}${typeof recipeGroupPills==='function'?`<div class="group-pills">${recipeGroupPills(name)}</div>`:''}${typeof ratingSummaryHTML==='function'?ratingSummaryHTML(name):''}</div><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
  ${typeof recipePhotoHTML==='function'?recipePhotoHTML(r,'recipe-photo-large'):''}
  <div class="card"><div class="row between"><b>Servings</b><div class="row"><button class="btn secondary" onclick="changeDetailServings(-1)">−</button><input id="detailServings" class="qty" type="number" min="1" value="${r.baseServings}" onchange="renderDetailIngredients(decodeURIComponent('${encId(name)}'))"><button class="btn secondary" onclick="changeDetailServings(1)">＋</button></div></div></div>
  <h2>Ingredients</h2><div id="detailSummary"></div><div id="detailIngredients"></div>
  ${r.directions.length?`<h2>Instructions</h2><div class="card">${r.directions.flatMap(d=>String(d).split(/\n+/)).map(d=>d.trim()).filter(Boolean).map(d=>`<div class="ingredient">${esc(d)}</div>`).join('')}</div>`:''}
  <div class="actions"><button class="btn" onclick="openCookMode(decodeURIComponent('${encId(name)}'))">👩‍🍳 Cook mode</button><button class="btn secondary" onclick="toggleRecipeSelection(decodeURIComponent('${encId(name)}'));openRecipe(decodeURIComponent('${encId(name)}'))">${state.selected[name]?'✓ Remove from shopping':'＋ Add to shopping'}</button><button class="btn secondary" onclick="openRecipeEditor(decodeURIComponent('${encId(name)}'))">Edit recipe</button><button class="btn secondary" onclick="openRecipePhoto(decodeURIComponent('${encId(name)}'))">📷 Photo</button><button class="btn secondary" onclick="openRecipeGroups(decodeURIComponent('${encId(name)}'))">📁 Groups</button><button class="btn secondary" onclick="toggleFavorite(decodeURIComponent('${encId(name)}'));openRecipe(decodeURIComponent('${encId(name)}'))">${fav?'★ Favorite':'☆ Favorite'}</button></div>`);
  renderDetailIngredients(name);
}
function changeDetailServings(delta){const el=document.getElementById('detailServings');el.value=Math.max(1,(num(el.value)||1)+delta);renderDetailIngredients(currentModalRecipe())}
function currentModalRecipe(){return window.currentRecipeId||''}
function renderDetailIngredients(name){
  const r=state.data.recipes[name], s=num(document.getElementById('detailServings')?.value)||r.baseServings, scale=s/r.baseServings;
  const summary=document.getElementById('detailSummary');if(summary&&typeof recipeCostHTML==='function'){const rd=recipeReadiness(name,s);summary.innerHTML=recipeCostHTML(name,s)+(rd?(rd.ready?'<div class="cost-line ready-line">✓ You have everything in the pantry</div>':`<div class="cost-line small muted">Not in the pantry: ${esc(rd.lacking.join(', '))}</div>`):'')}
  document.getElementById('detailIngredients').innerHTML=r.ingredients.map((i,ix)=>`<div class="ingredient row"><div class="ingredient-thumb small">${ingredientPicture(i.name)}</div><div class="grow"><b>${esc(i.name)}</b>${i.note?` <span class="muted small">· ${esc(i.note)}</span>`:''}<div class="muted small">${esc((typeof containerText==='function'&&containerText(i.name))||i.container||'')}</div></div><div class="amount">${displayQty(i,scale)} ${esc(i.unit||'')}${(()=>{const q=num(i.qty);const t=typeof convertedText==='function'&&q!==null?convertedText(q*scale,i.unit,i.name):'';return t?(typeof conversionFactorUsed==='function'&&conversionFactorUsed(i.unit,getPackage(i.name)?.unit,i.name)?` <button type="button" class="converted converted-btn" aria-label="Change conversion for ${esc(i.name)}" onclick="editConversionInRecipe(decodeURIComponent('${encId(name)}'),${ix})">(${esc(t)})</button>`:` <span class="converted">(${esc(t)})</span>`):(i.converted&&scale===1?` <span class="converted">(${i.converted.estimate?'≈ ':''}${esc(fmt(i.converted.qty))} ${esc(i.converted.unit)})</span>`:'')})()}</div></div>`).join('');
}
function addRecipeSelection(name, servings){
  const r=state.data.recipes[name], s=servings||r.baseServings;
  state.selected[name]=(state.selected[name]||0)+s;
  save();toast(`${name} added to shopping list`);
}
function toggleRecipeSelection(name){
 if(state.selected[name]){delete state.selected[name];save();toast(recipeName(name)+' removed from shopping')}
 else{state.selected[name]=state.data.recipes[name].baseServings;save();toast(recipeName(name)+' added to shopping')}
}
function removeSelection(name){delete state.selected[name];save()}

// Preserve existing day|meal entries and add independent day|meal|unique-id entries.
function currentMealStatus(key,recipe,servings){const prev=state.plan[key];return prev?.recipe===recipe&&Number(prev.servings)===Number(servings)&&prev.cooked?{cooked:true,cookedServings:prev.cookedServings}:{}}
window.PACKAGE_PICTURES = window.PACKAGE_PICTURES || {};   // filled in by ingredient-pictures.js, loaded after the app opens
const PACKAGE_PICTURE_ALIASES = {"chicken breast":"chicken","boneless skinless chicken breasts":"chicken","gaya seasoning":"goya seasoning","tomato boulon":"tomato bouillon","pico":"pico de gallo","tostitos cheese dip":"tostitos cheese","spreadable butter (tub)":"spreadable butter","hash browns":"frozen hash browns","waffles":"frozen waffles","frozen tater tots":"tater tots","shredded mozzarella":"mozzarella cheese","colby jack cheese":"shredded cheese","cheddar cheese":"shredded cheese","sliced swiss cheese":"swiss cheese","cajita cheese":"cajita cheese","chihuahua cheese":"chihuahua cheese","onion":"yellow onions","green chiles":"green chilis","potato":"potatoes","chicken broth":"beef broth","mashed potatoes":"instant mashed potatoes","frozen vegetables":"frozen mixed vegetables","ground pork":"ground beef","coleslaw mix":"lettuce","cilantro":"spinach","ranch":"ranch dressing","mustard yellow":"mustard","pancake syrup":"syrup","instant waffles":"frozen waffles"};
function ingredientPicture(name){const k=name.toLowerCase().trim(),meta=state.itemMeta?.[k],url=(meta?.photoId&&window.photoCache?.[meta.photoId])||meta?.imageUrl;if(url&&(/^(https:\/\/|data:image\/)/i.test(url)))return `<img src="${esc(url)}" alt="${esc(name)} package" loading="lazy" onerror="this.replaceWith(document.createTextNode('🛒'))">`;if(typeof ingredientPhotoURL==='function'&&pictureStyle()==='photos'){const ph=ingredientPhotoURL(k);if(ph)return `<img class="photo" src="${esc(ph)}" data-full="${esc(ingredientPhotoURL(k,false))}" data-key="${esc(k)}" alt="${esc(name)}" loading="lazy" onerror="pictureFailed(this)">`}const key=PACKAGE_PICTURE_ALIASES[k]||k;const picture=PACKAGE_PICTURES[key];if(picture)return `<img src="${picture}" alt="${esc(name)} grocery package illustration" loading="lazy" onerror="this.replaceWith(document.createTextNode('🛒'))">`;return typeof departmentIcon==='function'?departmentIcon(k):'🛒'}

let photoTarget=null;
function editIngredientPhoto(code){
 photoTarget=decodeURIComponent(code);
 let panel=document.getElementById('ingredientPhotoPanel');
 if(!panel){panel=document.createElement('div');panel.id='ingredientPhotoPanel';panel.className='photo-overlay';panel.innerHTML=`<div class="photo-dialog" role="dialog" aria-modal="true" aria-label="Ingredient picture"><h3>Ingredient picture</h3><p id="photoTargetLabel"></p><div id="photoFlowNote" class="small muted"></div><div class="actions"><button class="btn" onclick="chooseIngredientPhoto(true)">📷 Take photo</button><button class="btn secondary" onclick="chooseIngredientPhoto(false)">🖼️ Photo library</button></div><h4 class="photo-suggest-title">Or choose a picture</h4><div id="photoSuggest" class="photo-grid"></div><div id="photoFlowBar" class="actions"></div><div class="actions"><button class="btn secondary" onclick="resetIngredientPhoto()">Restore default</button><button class="btn secondary" onclick="closeIngredientPhoto()">Close</button></div><input id="ingredientCamera" type="file" accept="image/*" capture="environment" style="display:none" onchange="handleIngredientPhoto(event)"><input id="ingredientLibrary" type="file" accept="image/*" style="display:none" onchange="handleIngredientPhoto(event)"></div>`;document.body.appendChild(panel)}
 document.getElementById('photoTargetLabel').textContent=photoTarget;
 panel.style.display='flex';
 if(typeof renderIngredientPictureExtras==='function')renderIngredientPictureExtras(photoTarget);
}
function chooseIngredientPhoto(camera){document.getElementById(camera?'ingredientCamera':'ingredientLibrary').click()}
function closeIngredientPhoto(){const panel=document.getElementById('ingredientPhotoPanel');if(panel)panel.style.display='none';photoTarget=null}
function resetIngredientPhoto(){if(!photoTarget)return;state.itemMeta??={};const k=photoTarget;state.itemMeta[k]={...(state.itemMeta[k]||{})};const oldPhoto=state.itemMeta[k].photoId;delete state.itemMeta[k].imageUrl;delete state.itemMeta[k].photoId;save();if(oldPhoto&&typeof removePhoto==='function')removePhoto(oldPhoto);closeIngredientPhoto();toast('Default picture restored')}
async function handleIngredientPhoto(event){
 const file=event.target.files?.[0],key=photoTarget;event.target.value='';if(!file||!key)return;
 if(!file.type.startsWith('image/'))return alert('Choose a picture file.');
 try{
  const image=await createImageBitmap(file),canvas=document.createElement('canvas'),max=360,ratio=Math.min(1,max/Math.max(image.width,image.height));
  canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
   const data=canvas.toDataURL('image/jpeg',.58);state.itemMeta??={};const previous=state.itemMeta[key];
   // Photos live in IndexedDB (no 5 MB limit); fall back to the saved data if that isn't available.
   let photoId=null;try{if(typeof storePhoto==='function'){await window.photosReady;photoId=await storePhoto(data)}}catch(err){console.warn('Photo storage unavailable; keeping it with the saved data',err)}
   const next={...(previous||{})};delete next.imageUrl;delete next.photoId;if(photoId)next.photoId=photoId;else next.imageUrl=data;state.itemMeta[key]=next;
   try{save()}catch(err){if(previous)state.itemMeta[key]=previous;else delete state.itemMeta[key];if(photoId)removePhoto(photoId);console.error('Photo save failed:',err);return alert('Unable to save photo: '+(err?.name==='QuotaExceededError'?'device storage is full. Try freeing browser storage.':'please try again. Your existing photo has been preserved.'))}
   if(previous?.photoId&&previous.photoId!==photoId)removePhoto(previous.photoId);
  const savedKey=key;closeIngredientPhoto();toast('Ingredient picture saved');if(typeof ingredientPictureSaved==='function')ingredientPictureSaved(savedKey);
 }catch(err){console.error(err);alert('Could not process this photo. Try a different picture.')}
}
function renderShopping(){
 const sel=selectedForShopping(),names=Object.keys(sel),combined={};
 
 document.getElementById('shoppingMeta').textContent=names.length?`From ${names.length} recipe${names.length===1?'':'s'}: ${typeof shoppingRangeText==='function'?shoppingRangeText():'your plan'}, plus any you added.`:'Plan meals or add recipes to build your list.';{let bar=document.getElementById('shopSortBar');if(!bar&&typeof shopSortBarHTML==='function'){bar=document.createElement('div');bar.id='shopSortBar';document.getElementById('shoppingMeta').insertAdjacentElement('afterend',bar)}if(bar)bar.innerHTML=(typeof liveBadgeHTML==='function'?liveBadgeHTML():'')+shopSortBarHTML()}
 for(const name of names){const r=state.data.recipes[name],scale=sel[name]/r.baseServings;for(const i of r.ingredients){const key=i.name.toLowerCase().trim(),q=num(i.qty),unit=normUnit(i.unit),pkg=getPackage(i.name),groupKey=key+'|'+(pkg?normUnit(pkg.unit):unit);
 if(!combined[groupKey])combined[groupKey]={name:i.name,unit:pkg?.unit||unit,qty:0,pkg,issues:[],sources:[]};const row=combined[groupKey];row.sources.push(name);
 if(q===null||q<=0){row.issues.push('Check recipe quantity');continue}
 if(!pkg){row.issues.push('Choose a package size');row.qty+=q*scale;continue}
 const converted=compatible(q,unit,pkg.unit,key);if(!converted){row.issues.push('Conversion needed: '+unit+' → '+pkg.unit);row.convNeed??={from:unit,to:pkg.unit};continue}
 row.qty+=converted.qty*scale;if(converted.estimate)row.issues.push('Approximate conversion (typical weight)');if(i.auditStatus&&i.auditStatus.startsWith('Review'))row.issues.push(i.auditStatus);
 }}
 const rows=Object.values(combined).sort((a,b)=>a.name.localeCompare(b.name));
 for(const row of rows){const key=row.name.toLowerCase().trim(),stock=Number(state.pantry?.[key]?.qty||0);row.originalQty=row.qty;row.pantryPacks=stock;row.pantryUsed=row.pkg&&stock>0?Math.min(row.qty,stock*row.pkg.qty):0;row.qty=Math.max(0,row.qty-row.pantryUsed)}
 if(typeof addStapleRows==='function')addStapleRows(rows);
 window.lastShoppingRows=rows;
 const groups={};let estimated=0,priced=0;
 for(const x of rows){const category=departmentFor(x.name);(x.qty<=1e-8&&x.originalQty>0&&x.pkg?(groups['Covered by Pantry']??=[]):(groups[category]??=[])).push(x);const p=x.pkg,issues=x.issues||[],safe=p&&issues.every(t=>!t.startsWith('Cannot')&&!t.startsWith('Conversion needed')&&!t.startsWith('Check recipe'));const packs=safe&&x.qty>0?Math.ceil(x.qty/p.qty-1e-9):null;const info=effectivePrice(x.name.toLowerCase());if(packs!==null&&info){estimated+=packs*info.value;priced++}}
 const totalBox=document.getElementById('shoppingTotal');totalBox.style.display=showPrices?'block':'none';totalBox.innerHTML=`<b>Estimated cart: $${estimated.toFixed(2)}</b><div class="small">${priced} priced items out of ${rows.length}; missing prices excluded. All prices are estimates.</div>`;
 let order=['Produce','Meat & Seafood','Dairy & Refrigerated','Bakery','Pantry & Canned','Frozen','Household','Other / Uncategorized','Covered by Pantry'];if(typeof shopDeptOrder==='function')order=shopDeptOrder(order,groups);
 const hideChecked=document.getElementById('hideChecked')?.checked;document.getElementById('shoppingList').classList.toggle('shopDone',!!hideChecked);document.getElementById('shoppingList').innerHTML=rows.length?order.filter(g=>groups[g]?.length).map(g=>`<details class="department ${g==='Covered by Pantry'?'covered-department':''}" ${g==='Covered by Pantry'?'':'open'}><summary>${g==='Covered by Pantry'?'🏠 ✓ ':''}${esc(g)} (${groups[g].length}) ${g==='Covered by Pantry'?'— No need to buy':''}</summary>${(typeof shopSort==='function'?shopSort(groups[g]):groups[g]).map(x=>{const key=x.name.toLowerCase(),id=encId(key),done=!!state.checks[key],p=x.pkg,issues=[...new Set(x.issues)],safe=p&&issues.every(t=>!t.startsWith('Cannot')&&!t.startsWith('Conversion needed')&&!t.startsWith('Check recipe'));const packs=safe?Math.ceil(x.qty/p.qty-1e-9):null;const priceInfo=effectivePrice(key),price=priceInfo?.value;return `<div class="listitem shop-row ${done?'done':''} ${g==='Covered by Pantry'?'covered-row':''}"><input aria-label="Mark ${esc(x.name)} purchased" class="check" type="checkbox" ${done?'checked':''} onchange="toggleCheck(decodeURIComponent('${id}'))"><div class="ingredient-thumb">${ingredientPicture(x.name)}</div><div class="shop-name"><b>${esc(x.name)}</b>${typeof checkedByHTML==='function'?checkedByHTML(key):''}${p?`<div class="tiny muted">${esc(packageText(p))}</div>`:''}${x.pantryUsed&&g!=='Covered by Pantry'?'<span class="partial-badge">Partially covered</span>':''}${x.staple?'<span class="staple-badge">⭐ Staple</span>':''}</div><div class="shop-buy ${g==='Covered by Pantry'?'buy-covered':''}">${g==='Covered by Pantry'?'<span>✓ COVERED</span><strong>Buy 0</strong>':`<span>BUY</span><strong>${packs!==null?esc(buyText(packs,p)):fmt(x.qty)+' '+esc(x.unit)}</strong>${p&&packs!==null&&perPackText(p)?`<small>${esc(perPackText(p))}</small>`:''}`}</div><div class="shop-need"><div>Need: <b>${fmt(x.originalQty)} ${esc(x.unit)}</b></div><div>Pantry: <b>${x.pkg?fmt(x.pantryPacks*x.pkg.qty)+' '+esc(x.unit):'Not set'}</b></div>${issues.length?`<div class="tiny warning">⚠ ${issues.map(esc).join('; ')}</div>`:''}${x.convNeed?`<button class="btn ghost small conv-btn" onclick="askShopConversion('${id}')">Set conversion</button>`:''}${showPrices&&price!==undefined?`<div class="small">$${(Number(price)*(packs||0)).toFixed(2)}</div>`:''}</div><details class="shop-expand"><summary aria-label="Details for ${esc(x.name)}">⌄</summary><div class="shop-expand-body"><div class="row between" style="margin-bottom:8px"><b class="small">Shopping item</b><button type="button" class="btn secondary" style="padding:6px 11px" onclick="this.closest('details.shop-expand').open=false">⌃ Collapse</button></div><div class="actions"><button class="btn secondary" onclick="openShopPantry('${id}')">🏠 Edit Pantry</button><button class="btn secondary" onclick="toggleInlineIngredient('${id}','shop')">Edit package</button><button class="btn secondary" onclick="editIngredientPhoto('${id}')">📷 Picture</button></div><div id="inline-shop-${id}"></div></div></details></div>`}).join('')}</details>`).join(''):'<div class="empty">Your shopping list is empty.</div>';

}

const DEPARTMENTS=['Produce','Meat & Seafood','Dairy & Refrigerated','Bakery','Pantry & Canned','Frozen','Household','Other / Uncategorized'];
let showPrices=false;
function togglePrices(){showPrices=!showPrices;renderShopping()}
function departmentFor(name){const k=name.toLowerCase(),saved=state.itemMeta?.[k]?.department;if(saved)return saved;
 if(/frozen|ice cream/.test(k))return 'Frozen';if(/chicken|beef|pork|sausage|bacon|turkey|salmon|shrimp|fish|hot dogs|\bham\b|steak|pepperoni|salami|meatball|chorizo|brisket|\bribs?\b|lamb|tuna/.test(k))return 'Meat & Seafood';if(/milk|cheese|butter|yogurt|egg|cream/.test(k))return 'Dairy & Refrigerated';if(/bread|bun|tortilla|bagel|roll/.test(k))return 'Bakery';if(/apple|onion|tomato|potato|lettuce|carrot|pepper|broccoli|banana|celery|spinach|garlic|lime|lemon/.test(k))return 'Produce';if(/rice|pasta|sauce|salsa|oil|flour|sugar|salt|pepper|seasoning|broth|bean|can|cereal|breadcrumb|noodle/.test(k))return 'Pantry & Canned';return 'Other / Uncategorized'}
function allIngredients(){
 const names=new Set(Object.keys(PACKAGE_DEFAULTS||{}));
 const recipes=state?.data?.recipes||{};
 for(const recipe of Object.values(recipes))for(const item of (Array.isArray(recipe?.ingredients)?recipe.ingredients:[])){
  if(typeof item?.name==='string'&&item.name.trim())names.add(item.name.toLowerCase().trim());
 }
 for(const k of Object.keys(state?.data?.ingredients||{}))names.add(k.toLowerCase().trim());
 for(const k of Object.keys(state?.packagePrefs||{}))names.add(k.toLowerCase().trim());
 for(const k of Object.keys(state?.itemMeta||{}))names.add(k.toLowerCase().trim());
 const deleted=new Set(state?.deletedIngredients||[]);return [...names].filter(k=>k&&!deleted.has(k)).sort((a,b)=>a.localeCompare(b));
}
let ingredientLetter='',ingredientLimit=40;
function setIngredientLetter(l){ingredientLetter=l;ingredientLimit=40;renderIngredients();document.getElementById('ingredientCatalog')?.scrollIntoView({block:'start'})}
function renderIngredients(){
 const host=document.getElementById('ingredientCatalog');if(!host)return;
 try{
  const q=(document.getElementById('ingredientSearch')?.value||'').trim().toLowerCase();
  // long lists: A–Z letters, then 40 at a time ("Show more")
  const all=allIngredients().slice().sort((a,b)=>a.localeCompare(b)),letterOf=k=>(/[a-z]/.test(k[0])?k[0]:'#').toUpperCase();
  const letters=[...new Set(all.map(letterOf))];
  if(q||!letters.includes(ingredientLetter))ingredientLetter=q?ingredientLetter:'';
  const matched=all.filter(k=>k.includes(q)&&(q||!ingredientLetter||letterOf(k)===ingredientLetter));
  const keys=matched.slice(0,ingredientLimit);
  const rows=[];
  for(const k of keys){
   const id=encId(k);
   try{
    const saved=state.packagePrefs?.[k],p=displayPackage(k);
    const source=saved?'Saved package':PACKAGE_DEFAULTS[k]?'Suggested package':legacyPackage(k)?'Original catalog · confirm when editing':'Package details not set';
    const desc=p?esc(packageText(p)):'No package size';
    rows.push(`<div class="card"><div class="row between"><div class="row" style="align-items:center;gap:10px"><div class="ingredient-thumb">${ingredientPicture(k)}</div><div><b>${esc(k)}</b><div class="small muted">${esc(departmentFor(k))} · ${desc} · ${esc(source)}</div></div></div><button class="btn secondary" onclick="toggleInlineIngredient('${id}','catalog')">Edit</button></div><div id="inline-catalog-${id}"></div></div>`);
   }catch(itemError){console.warn('Ingredient row issue:',k,itemError);rows.push(`<div class="card"><b>${esc(k)}</b><p class="small muted">Could not display package information. ${esc(itemError?.message||'')}</p><button class="btn secondary" onclick="toggleInlineIngredient('${id}','catalog')">Edit</button><div id="inline-catalog-${id}"></div></div>`)}
  }
  // Parse each catalog row separately so a malformed row cannot nest later cards.
  host.replaceChildren();
  if(!q&&all.length>30){const bar=document.createElement('div');bar.className='az-bar';bar.setAttribute('role','group');bar.setAttribute('aria-label','Jump to letter');bar.innerHTML=`<button class="az ${ingredientLetter?'':'on'}" onclick="setIngredientLetter('')">All</button>`+letters.map(l=>`<button class="az ${l===ingredientLetter?'on':''}" aria-pressed="${l===ingredientLetter}" onclick="setIngredientLetter('${l}')">${l}</button>`).join('');host.appendChild(bar)}
  const count=document.createElement('p');count.className='small muted';count.textContent=`${matched.length} ingredient${matched.length===1?'':'s'}${q?' found':''}${matched.length>keys.length?` · showing ${keys.length}`:''}`;host.appendChild(count);
  if(!rows.length){const empty=document.createElement('div');empty.className='card';empty.textContent='No matching ingredients. Clear the search to see all ingredients.';host.appendChild(empty)}
  for(const markup of rows){const template=document.createElement('template');template.innerHTML=markup.trim();host.appendChild(template.content)}
  if(matched.length>keys.length){const more=document.createElement('button');more.className='btn secondary show-more';more.textContent=`Show ${Math.min(40,matched.length-keys.length)} more`;more.onclick=()=>{ingredientLimit+=40;renderIngredients()};host.appendChild(more)}
 }catch(err){console.error('Ingredient catalog error:',err);host.innerHTML='<div class="card"><b>Ingredients could not load.</b><p>'+esc(err.message||String(err))+'</p></div>'}
}

function toggleInlineIngredient(encoded,location){const k=decodeURIComponent(encoded),box=document.getElementById(`inline-${location}-${encoded}`);if(!box)return;if(box.innerHTML){box.innerHTML='';if(typeof revealIngredient==='function')revealIngredient(location,encoded);return}const p=displayPackage(k)||{qty:'',unit:'',label:''},legacy=legacyPackage(k),meta=state.itemMeta?.[k]||{};box.innerHTML=`<div class="edit-inline"><h3>Edit ${esc(k)}</h3><label>Ingredient name</label><input id="in-${location}-${encoded}" value="${esc(k)}" placeholder="Ingredient name"><p class="small muted">Renaming updates recipes, pantry, package settings, pictures, barcodes and saved conversions.</p>${legacy?`<p class="small muted">Original catalog value loaded for review. Confirm package details before saving.</p>`:''}<p class="small muted" style="margin-bottom:0">Container: the package it comes in. Recipe amounts are converted into its unit for shopping and the pantry.</p><div class="formrow"><div><label>Container size</label><input id="iq-${location}-${encoded}" type="number" step="any" min="0.001" value="${esc(p.qty)}"></div><div><label>Unit</label><input id="iu-${location}-${encoded}" value="${esc(p.unit)}" placeholder="oz, lb, fl oz, ea."></div></div><label>Container type</label><input id="il-${location}-${encoded}" value="${esc(p.label)}" placeholder="bag, carton, can, each">${typeof conversionEditorHTML==='function'?conversionEditorHTML(k,location,encoded):''}<details style="margin:10px 0"><summary>Exact unit-to-unit conversion (advanced)</summary><p class="small muted">Overrides the conversions above for one pair of units. Example: 1 head = 10 cloves. Once saved, the app remembers it for this ingredient.</p><div class="formrow"><div><label>1 recipe unit</label><input id="icf-${location}-${encoded}" placeholder="cup, tbsp, each"></div><div><label>Equals</label><input id="icr-${location}-${encoded}" type="number" min="0.000001" step="any" placeholder="4"></div></div><label>Package unit</label><input id="ict-${location}-${encoded}" value="${esc(p.unit)}" placeholder="oz, lb, fl oz"><div class="actions"><button type="button" class="btn secondary" onclick="saveIngredientConversion('${encoded}','${location}')">Save conversion</button><button type="button" class="btn secondary" onclick="clearIngredientConversions('${encoded}','${location}')">Clear conversions</button></div><div id="icstatus-${location}-${encoded}" class="small muted"></div></details><label>Price per package ($) · rough budget estimate: ${budgetEstimate(k)!=null?'$'+budgetEstimate(k).toFixed(2):'unavailable'}</label><input id="ip-${location}-${encoded}" type="number" min="0" step="0.01" value="${esc(meta.price??'')}">${typeof priceHistoryHTML==='function'?priceHistoryHTML(k):''}${typeof stapleEditorHTML==='function'?stapleEditorHTML(k,location,encoded):''}
<div class="actions" style="margin:10px 0"><button class="btn secondary" onclick="editIngredientPhoto('${encoded}')">📷 Change picture</button></div><label>Grocery department</label><select id="id-${location}-${encoded}">${DEPARTMENTS.map(d=>`<option ${departmentFor(k)===d?'selected':''}>${esc(d)}</option>`).join('')}</select><details><summary>View recipes using this ingredient (${ingredientUses(k).length})</summary>${ingredientUses(k).map(({name,i})=>`<div class="inspector-entry"><b>${esc(recipeName(name))}</b> · ${esc(i.qty)} ${esc(i.unit)}<button class="btn secondary" onclick="openRecipeEditor(decodeURIComponent('${encId(name)}'))">Edit recipe</button></div>`).join('')||'No recipes yet'}</details><div class="actions"><button class="btn" onclick="saveInlineIngredient('${encoded}','${location}')">Save ingredient</button><button class="btn secondary" onclick="toggleInlineIngredient('${encoded}','${location}')">Cancel</button><button class="btn secondary" onclick="deleteIngredient('${encoded}','${location}')">Delete ingredient</button></div></div>`}
function saveIngredientConversion(encoded,location){const name=decodeURIComponent(encoded),from=normUnit(document.getElementById(`icf-${location}-${encoded}`)?.value),to=normUnit(document.getElementById(`ict-${location}-${encoded}`)?.value),rate=Number(document.getElementById(`icr-${location}-${encoded}`)?.value);if(!from||!to||!(rate>0))return alert('Enter the recipe unit, package unit, and how many package units equal 1 recipe unit.');state.ingredientConversions??={};state.ingredientConversions[conversionKey(name,from,to)]={rate,from,to,updatedAt:new Date().toISOString()};save();const el=document.getElementById(`icstatus-${location}-${encoded}`);if(el)el.textContent=`Saved: 1 ${from} = ${fmt(rate)} ${to}`;toast('Conversion saved for '+name)}
function clearIngredientConversions(encoded,location){const name=decodeURIComponent(encoded).toLowerCase().trim();state.ingredientConversions??={};let n=0;for(const k of Object.keys(state.ingredientConversions)){if(k.startsWith(name+'|')){delete state.ingredientConversions[k];n++}}save();const el=document.getElementById(`icstatus-${location}-${encoded}`);if(el)el.textContent=n?'Saved conversions cleared.':'No saved conversions.';toast(n?'Ingredient conversions cleared':'No conversions to clear')}
function ingredientKey(name){return String(name||'').toLowerCase().trim()}
function moveIngredientKey(obj,oldKey,newKey,merge=false){if(!obj||oldKey===newKey||!Object.prototype.hasOwnProperty.call(obj,oldKey))return;if(!Object.prototype.hasOwnProperty.call(obj,newKey)||!merge)obj[newKey]=obj[oldKey];delete obj[oldKey]}
function renameIngredientEverywhere(oldName,newName,merge=false){const oldKey=ingredientKey(oldName),newKey=ingredientKey(newName);if(!oldKey||!newKey||oldKey===newKey)return;
 for(const r of Object.values(state.data.recipes||{}))for(const i of (r.ingredients||[]))if(ingredientKey(i.name)===oldKey)i.name=newName;
 state.deletedIngredients??=[];if(!state.deletedIngredients.includes(oldKey))state.deletedIngredients.push(oldKey);state.deletedIngredients=state.deletedIngredients.filter(k=>k!==newKey);
 moveIngredientKey(state.packagePrefs,oldKey,newKey,merge);moveIngredientKey(state.itemMeta,oldKey,newKey,merge);moveIngredientKey(state.pantry,oldKey,newKey,merge);
 if(state.pantry?.[newKey])state.pantry[newKey].name=newName;
 for(const link of Object.values(state.barcodeLinks||{}))if(ingredientKey(link?.name||link)===oldKey){if(typeof link==='object')link.name=newName}
 const converted={};for(const [k,v] of Object.entries(state.ingredientConversions||{})){if(k.startsWith(oldKey+'|'))converted[newKey+k.slice(oldKey.length)]=v;else converted[k]=v}state.ingredientConversions=converted;
 if(state.data.ingredients){moveIngredientKey(state.data.ingredients,oldKey,newKey,merge)}
}
async function saveInlineIngredient(encoded,location){const oldName=decodeURIComponent(encoded),oldKey=ingredientKey(oldName),val=field=>document.getElementById(`${field}-${location}-${encoded}`)?.value??'',newName=val('in').trim(),newKey=ingredientKey(newName),qty=num(val('iq')),unit=normUnit(val('iu')),label=val('il').trim(),price=val('ip');if(!newName)return alert('Enter an ingredient name.');if(!(qty>0)||!unit||!label)return alert('Enter a valid package amount, unit and type.');if(price!==''&&(!Number.isFinite(Number(price))||Number(price)<0))return alert('Enter a valid price.');let merge=false;if(newKey!==oldKey&&allIngredients().some(n=>ingredientKey(n)===newKey)){merge=await ask('“'+newName+'” already exists. Merge this ingredient into it?');if(!merge)return}state.packagePrefs??={};state.itemMeta??={};if(newKey!==oldKey)renameIngredientEverywhere(oldName,newName,merge);state.packagePrefs[newKey]={qty,unit,label};state.itemMeta[newKey]={...(state.itemMeta[newKey]||{}),department:val('id'),...(price!==''?{price:Number(price),priceSource:(Number(price)===Number(state.itemMeta[newKey]?.price)&&state.itemMeta[newKey]?.priceSource)||'manual',priceUpdatedAt:new Date().toISOString()}:{price:state.itemMeta[newKey]?.autoPrice??null,priceSource:state.itemMeta[newKey]?.autoPrice!=null?'auto':null})};{const rd=f=>{const el=document.getElementById(f+'-'+location+'-'+encoded);if(!el)return undefined;return el.value===''?null:Number(el.value)},gpc=rd('gpc'),gpe=rd('gpe'),m=state.itemMeta[newKey];if(gpc!==undefined){if(gpc>0)m.gramsPerCup=gpc;else delete m.gramsPerCup}if(gpe!==undefined){if(gpe>0)m.gramsPerEach=gpe;else delete m.gramsPerEach}}if(typeof refreshAllRecipeConversions==='function')refreshAllRecipeConversions();save();if(location==='catalog')renderIngredients();else renderShopping();if(typeof revealIngredient==='function')revealIngredient(location,encId(newKey));toast('✓ '+newName+(newKey!==oldKey?' renamed and saved':' saved'))}
async function deleteIngredient(encoded,location){const name=decodeURIComponent(encoded),key=ingredientKey(name),uses=ingredientUses(name);if(uses.length)return alert('This ingredient is used by '+uses.length+' recipe'+(uses.length===1?'':'s')+'. Edit those recipes before deleting it.');if(!await ask('Delete “'+name+'” and its saved package, pantry, picture, barcode and conversion data?'))return;state.deletedIngredients??=[];if(!state.deletedIngredients.includes(key))state.deletedIngredients.push(key);delete state.packagePrefs?.[key];const oldPhoto=state.itemMeta?.[key]?.photoId;delete state.itemMeta?.[key];if(oldPhoto&&typeof removePhoto==='function')removePhoto(oldPhoto);delete state.pantry?.[key];delete state.data.ingredients?.[key];for(const [code,link] of Object.entries(state.barcodeLinks||{}))if(ingredientKey(link?.name||link)===key)delete state.barcodeLinks[code];for(const k of Object.keys(state.ingredientConversions||{}))if(k.startsWith(key+'|'))delete state.ingredientConversions[k];save();if(location==='catalog')renderIngredients();else renderShopping();toast('Ingredient deleted')}
async function clearSelections(){if(!Object.keys(state.selected||{}).length)return toast('No manually selected recipes to clear');if(!await ask('Remove all manually selected recipes from shopping? Planned meals will stay.'))return;state.selected={};save();toast('Shopping selections cleared')}
const RECIPE_MEAL_TYPES=['Breakfast','Lunch','Dinner','Snack'];
function inferRecipeMealTypes(name,recipe){const n=(String(name||'')+' '+(recipe?.ingredients||[]).map(i=>i.name).join(' ')).toLowerCase();if(/\b(snack|popcorn|trail mix|energy bite|granola bar|chips|dip|fruit cup)\b/.test(n))return ['Snack'];if(/\b(pancake|waffle|french toast|breakfast|oatmeal|cereal|egg muffin|biscuits? and gravy|hash brown|bagel)\b/.test(n))return ['Breakfast'];if(/\b(sandwich|wrap|salad|soup|slider|sub\b|quesadilla)\b/.test(n))return ['Lunch','Dinner'];return ['Dinner']}
function recipeMealTypes(name){const r=state.data.recipes[name];return Array.isArray(r?.mealTypes)&&r.mealTypes.length?r.mealTypes:inferRecipeMealTypes(r?.name||name,r)}
function recipeFitsMeal(name,meal){return recipeMealTypes(name).includes(meal)}
function fillPlan(){return smartFillPlan()}
function renderSpending(){state.spending??={trips:[],budget:0};const trips=state.spending.trips,total=trips.reduce((s,t)=>s+Number(t.total),0),month=localDate().slice(0,7),monthly=trips.filter(t=>t.date?.startsWith(month)).reduce((s,t)=>s+Number(t.total),0),budget=Number(state.spending.budget)||0;document.getElementById('spendingDashboard').innerHTML=`<div class="card"><div class="muted small">This month</div><h1>$${monthly.toFixed(2)}</h1><label>Monthly budget ($)</label><div class="row"><input id="spendBudget" type="number" min="0" step="1" value="${budget}"><button class="btn" onclick="saveBudget()">Save</button></div>${budget?`<div class="budget-progress"><div style="width:${Math.min(100,monthly/budget*100)}%"></div></div><p>${monthly>budget?'Over budget by $'+(monthly-budget).toFixed(2):'$'+(budget-monthly).toFixed(2)+' remaining'}</p>`:''}<div class="small muted">All recorded trips: $${total.toFixed(2)}</div></div>`;document.getElementById('tripHistory').innerHTML='<h2>Purchase history</h2>'+trips.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(t=>`<div class="card"><div class="row between"><div><b>${esc(t.store)}</b><div class="small muted">${esc(t.date)} · ${esc(t.notes||'')}</div></div><b>$${Number(t.total).toFixed(2)}</b></div><button class="btn secondary" onclick="deleteTrip('${esc(t.id)}')">Delete</button></div>`).join('');const date=document.getElementById('tripDate');if(date&&!date.value)date.value=localDate()}
function saveBudget(){const n=Number(document.getElementById('spendBudget').value);if(!Number.isFinite(n)||n<0)return alert('Enter a valid budget');state.spending??={trips:[]};state.spending.budget=n;save();renderSpending();toast('Budget saved')}
function addTrip(){const store=document.getElementById('tripStore').value.trim(),date=document.getElementById('tripDate').value,total=Number(document.getElementById('tripTotal').value),notes=document.getElementById('tripNotes').value.trim();if(!store||!date||!Number.isFinite(total)||total<=0)return alert('Enter a store, date and positive total.');state.spending??={trips:[],budget:0};state.spending.trips.push({id:String(Date.now()),store,date,total,notes});save();['tripStore','tripTotal','tripNotes'].forEach(id=>document.getElementById(id).value='');renderSpending();toast('Grocery trip saved')}
async function deleteTrip(id){if(!await ask('Delete this grocery trip?'))return;state.spending.trips=state.spending.trips.filter(t=>t.id!==id);save();renderSpending()}
async function discoverCategory(cat){document.getElementById('onlineSearch').value=cat;document.getElementById('onlineMode').value='category';await searchOnline()}
async function surpriseMeal(){const box=document.getElementById('onlineResults');box.innerHTML='<div class="card">Finding a recipe…</div>';try{const r=await fetch('https://www.themealdb.com/api/json/v1/1/random.php');if(!r.ok)throw Error('Service unavailable');const data=await r.json(),m=data.meals?.[0];if(!m)throw Error('No recipe returned');onlineMeals[m.idMeal]=m;box.innerHTML=`<div class="card"><h3>${esc(m.strMeal)}</h3><div>${esc(m.strCategory||'')}</div><button class="btn" onclick="previewOnline('${m.idMeal}')">Preview recipe</button></div>`}catch(e){box.textContent='Could not fetch a recipe: '+e.message}}
function toggleCheck(id){if(typeof setChecked==='function')setChecked(id,!state.checks[id]);else state.checks[id]=!state.checks[id];save();if(typeof scheduleSync==='function')scheduleSync(250)}
function clearChecks(){state.checks={};save();toast('Shopping list unchecked')}

function openRecipeEditor(name,draft){
  if(packageReturn){document.getElementById('modal').classList.remove('show')}else closeModal();
  window.editingDraft=draft||null;
  const existing=name?state.data.recipes[name]:(draft||null);
  const ingredients=existing?.ingredients?.length?existing.ingredients:[{name:'',qty:1,unit:'ea.',container:'',containerSize:'',fraction:null}];
  openModal(`<div class="row between"><h2>${name?'Edit recipe':'Add recipe'}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
  ${draft?`<div class="card import-note small">📥 ${esc(draft.sourceType||'Imported')}${draft.sourceUrl?` from <a href="${esc(draft.sourceUrl)}" target="_blank" rel="noopener">${esc(new URL(draft.sourceUrl).hostname.replace(/^www\./,''))}</a>`:''}. Check each ingredient below: the original line is shown under it, and suggestions link it to ingredients you already have.</div>`:''}<label>Recipe name</label><input id="editName" type="text" value="${esc(existing?.name||'')}">
  <label>Base servings</label><input id="editServings" type="number" min="1" value="${existing?.baseServings||4}">
  <div class="formrow"><div><label for="editPrep">Prep time (minutes)</label><input id="editPrep" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 15" value="${esc(existing?.prepMinutes??'')}" oninput="updateTotalTime()"></div><div><label for="editCook">Cook time (minutes)</label><input id="editCook" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 30" value="${esc(existing?.cookMinutes??'')}" oninput="updateTotalTime()"></div></div><div id="editTotal" class="small muted"></div>
  <label>Meal categories</label><div class="card small"><div class="actions">${RECIPE_MEAL_TYPES.map(t=>`<label style="display:flex;align-items:center;gap:6px"><input class="editMealType" type="checkbox" value="${t}" style="width:auto" ${(name?recipeMealTypes(name):['Dinner']).includes(t)?'checked':''}> ${t}</label>`).join('')}</div><div class="muted">Automatic planning uses Breakfast, Lunch, and Dinner. Snack recipes are never auto-scheduled.</div></div>
  ${typeof editorGroupsHTML==='function'?`<label>Groups</label><div class="card small" id="editGroupsBox">${editorGroupsHTML(existing?recipeGroupIds(existing):(state.recipeGroups?.[recipeView]?[recipeView]:[]))}</div>`:''}
  <label>Instructions (one step per line)</label><textarea id="editDirections" rows="7">${esc(existing?.directions?.join('\n')||'')}</textarea>
  <h3 style="margin-top:16px">Ingredients</h3><div id="editIngredients"></div>
  <div class="actions"><button class="btn secondary" onclick="addIngredientRow()">＋ Ingredient</button><button class="btn" onclick="saveRecipe(decodeURIComponent('${encId(name||'')}'))">Save recipe</button>${name?`<button class="btn danger" onclick="deleteRecipe(decodeURIComponent('${encId(name)}'))">Delete</button>`:''}</div>`);
  window.editingIngredients=ingredients.map(i=>({...i}));
  renderEditIngredients();
  if(typeof updateTotalTime==='function')updateTotalTime();
}
function normalizeIngredientName(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ')}
function ingredientDistance(a,b){a=normalizeIngredientName(a);b=normalizeIngredientName(b);if(a===b)return 0;const prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let left=i,diag=i-1;for(let j=1;j<=b.length;j++){let v=Math.min(prev[j]+1,left+1,diag+(a[i-1]===b[j-1]?0:1));diag=prev[j];prev[j]=left;left=v}prev[0]=i}return prev[b.length]}
function ingredientMatches(value){const v=normalizeIngredientName(value);if(!v)return [];return allIngredients().map(k=>({k,score:normalizeIngredientName(k).startsWith(v)?0:normalizeIngredientName(k).includes(v)?1:ingredientDistance(v,k)<=Math.max(2,Math.floor(v.length*.22))?2:9})).filter(x=>x.score<9).sort((a,b)=>a.score-b.score||a.k.localeCompare(b.k)).slice(0,6)}
function updateIngredientSuggestions(idx){const item=window.editingIngredients[idx],target=document.getElementById('ingredient-suggest-'+idx);if(!target)return;const v=item.name||'',matches=ingredientMatches(v);target.innerHTML=matches.map(x=>`<button type="button" class="btn secondary" style="margin:3px;display:inline-block" onclick="selectExistingIngredient(${idx},decodeURIComponent('${encId(x.k)}'))">${esc(x.k)}${x.score===2?' · similar':''}</button>`).join('')+(v.trim()&&!allIngredients().some(k=>normalizeIngredientName(k)===normalizeIngredientName(v))?`<button type="button" class="btn" style="margin:3px" onclick="showNewIngredientPackage(${idx})">＋ Create “${esc(v)}”</button>`:'');}
function selectExistingIngredient(idx,name){const i=window.editingIngredients[idx];i.name=name;i.existingSelected=true;i.newPackage=null;const p=displayPackage(name);if(p)i.container=p.label;renderEditIngredients()}
function showNewIngredientPackage(idx){const i=window.editingIngredients[idx];if(!i.name.trim())return toast('Enter an ingredient name');i.newPackage=i.newPackage||{qty:'',unit:'',label:''};renderEditIngredients();}
function renderEditIngredients(){
  const set=(idx,f)=>`window.editingIngredients[${idx}].${f}`,refresh=idx=>`;if(typeof refreshEditRowConversion==='function')refreshEditRowConversion(${idx})`;
  document.getElementById('editIngredients').innerHTML=window.editingIngredients.map((i,idx)=>{const p=i.newPackage;return `<div class="card edit-ing" style="margin:8px 0"><div class="formrow"><div><label>Ingredient name</label><input type="text" autocomplete="off" value="${esc(i.name||'')}" oninput="${set(idx,'name')}=this.value;${set(idx,'existingSelected')}=false;updateIngredientSuggestions(${idx})${refresh(idx)}"><div class="small muted">${i.importedText?'From: “'+esc(i.importedText)+'”':'Choose an existing ingredient to avoid duplicates.'}</div><div id="ingredient-suggest-${idx}" class="ingredient-suggestions"></div></div><div><label>Recipe quantity</label><input type="number" step="any" min="0" value="${esc(i.recipeQty??i.qty??'')}" oninput="${set(idx,'qty')}=this.value;${set(idx,'recipeQty')}=this.value${refresh(idx)}"></div></div><div class="formrow"><div><label>Recipe unit</label><input type="text" value="${esc(i.recipeUnit||i.unit||'')}" placeholder="cup, oz, ea., can" oninput="${set(idx,'unit')}=this.value;${set(idx,'recipeUnit')}=this.value${refresh(idx)}"></div><div><label>Note</label><input type="text" value="${esc(i.note||'')}" placeholder="e.g. finely chopped" oninput="${set(idx,'note')}=this.value"></div></div><div id="convrow-${idx}" class="small">${typeof editRowConversionHTML==='function'?editRowConversionHTML(idx):''}</div>${p?`<div class="card" style="background:var(--soft)"><b>Container for ${esc(i.name||'this ingredient')}</b><p class="small">The package it comes in, like a 5 lb bag or a 32 fl oz carton. Saved to your Ingredients when the recipe is saved, and used for every recipe.</p><div class="formrow"><div><label>Container size</label><input type="number" step="any" min="0.001" value="${esc(p.qty)}" oninput="${set(idx,'newPackage')}.qty=this.value${refresh(idx)}"></div><div><label>Unit</label><input placeholder="oz, lb, fl oz, ea." value="${esc(p.unit)}" oninput="${set(idx,'newPackage')}.unit=this.value${refresh(idx)}"></div></div><label>Container type</label><input placeholder="bag, carton, can, bottle" value="${esc(p.label)}" oninput="${set(idx,'newPackage')}.label=this.value"><div class="actions"><button type="button" class="btn" onclick="saveContainerForRow(${idx})">Save container</button><button type="button" class="btn secondary" onclick="cancelContainerForRow(${idx})">Cancel</button></div></div>`:''}<div class="actions"><button class="btn danger" onclick="window.editingIngredients.splice(${idx},1);renderEditIngredients()">Remove</button></div></div>`}).join('');
}
function addIngredientRow(){window.editingIngredients.push({name:'',qty:1,unit:'ea.',container:'',fraction:null});renderEditIngredients()}
async function saveRecipe(oldName){
  const name=document.getElementById('editName').value.trim(), servings=Math.max(1,num(document.getElementById('editServings').value)||4);
  if(!name){toast('Enter a recipe name');return}
  const dirs=document.getElementById('editDirections').value.split('\n').map(x=>x.trim()).filter(Boolean);
  const minutesField=idn=>{const v=document.getElementById(idn)?.value;if(v===''||v==null)return null;const n=Math.round(Number(v));return Number.isFinite(n)&&n>=0?n:null};const prepMinutes=minutesField('editPrep'),cookMinutes=minutesField('editCook');
  const candidates=window.editingIngredients.filter(i=>String(i.name||'').trim());
  for(const i of candidates){const match=allIngredients().find(k=>normalizeIngredientName(k)===normalizeIngredientName(i.name));if(match)i.name=match;else{const near=ingredientMatches(i.name).filter(x=>x.score===2);if(near.length&&!i.existingSelected&&!await ask('“'+i.name+'” looks similar to “'+near[0].k+'”. Create a separate ingredient anyway?'))return}if(i.newPackage){const p=i.newPackage;if(!(Number(p.qty)>0)||!p.unit.trim()||!p.label.trim())return alert('Complete the package size, unit and type for '+i.name);state.packagePrefs??={};state.packagePrefs[i.name.toLowerCase().trim()]={qty:Number(p.qty),unit:normUnit(p.unit),label:p.label.trim()};}}
  const ingredients=candidates.map(i=>{

    const meta=state.data.ingredients[String(i.name).toLowerCase()]||null;
    const q=num(i.qty), cs=num(i.containerSize);
    const {newPackage,existingSelected,importedText,converted:_old,...clean}=i;const out={...clean,note:String(i.note||'').trim()||undefined,name:String(i.name).trim(),qty:q===null?i.qty:q,containerSize:cs,fraction:null,catalog:null,auditStatus:null};const pk=getPackage(out.name);if(pk){out.container=pk.label||out.container||'';out.containerSize=Number(pk.qty)||cs}if(typeof convertedForSave==='function'){const c=convertedForSave(out);if(c)out.converted=c}return out;
  });
  // oldName is the recipe's permanent id ('' for a new recipe): renaming keeps the same id, so favorites, plans and selections follow automatically.
  const id=oldName&&state.data.recipes[oldName]?oldName:newRecipeId();
  const mealTypes=[...document.querySelectorAll('.editMealType:checked')].map(x=>x.value);if(!mealTypes.length)return alert('Choose at least one meal category.');const groups=typeof editorSelectedGroups==='function'?editorSelectedGroups():(state.data.recipes[id]?.groups||[]);state.data.recipes[id]={...(state.data.recipes[id]||{}),id,name,...(groups.length?{groups}:{groups:undefined}),baseServings:servings,prepMinutes,cookMinutes,ingredients,directions:dirs,mealTypes,sourceType:state.data.recipes[id]?.sourceType||window.editingDraft?.sourceType||'Custom recipe',...(window.editingDraft&&!oldName?{photoUrl:window.editingDraft.photoUrl||'',sourceUrl:window.editingDraft.sourceUrl||''}:{})};window.editingDraft=null;
  save();closeModal();toast('Recipe saved');const afterConv=()=>{if(typeof promptMissingPictures==='function')promptMissingPictures(ingredients.map(i=>i.name))};const needs=typeof conversionsNeeded==='function'?conversionsNeeded(ingredients):[];if(needs.length)askConversionsInTurn(needs,()=>{refreshRecipeConversions(id);afterConv()});else afterConv()
}
async function deleteRecipe(name){
  if(!await ask(`Delete "${recipeName(name)}"?`))return;
  delete state.data.recipes[name];state.favorites=state.favorites.filter(x=>x!==name);delete state.selected[name];
  Object.keys(state.plan).forEach(k=>{if(state.plan[k]?.recipe===name)delete state.plan[k]});
  save();closeModal();toast('Recipe deleted')
}
function exportData(){
  downloadBackupFile({...state,photos:{...(window.photoCache||{})}},'gingham-backup-'+localDate()+'.json');
  noteExport();if(document.getElementById('home')?.classList.contains('active'))renderHome();
}
function importData(ev){
  const f=ev.target.files[0];if(!f)return;
  const rd=new FileReader();rd.onload=async()=>{let s;try{s=JSON.parse(rd.result);if(!s.data?.recipes)throw 0}catch(e){return alert('That backup file could not be imported.')}
    const shared=typeof syncActive==='function'&&syncActive();
    if(!await ask('Import will replace your current data'+(shared?' and your family\'s shared data on every phone':'')+'. A backup of the current data is saved on this phone first. Continue?'))return;
    try{await window.photosReady;if(typeof createSnapshot==='function')await createSnapshot('Before importing a backup file');
     const photos=s.photos||{};delete s.photos;for(const [id,url] of Object.entries(photos))await storePhoto(url,id);await moveInlinePhotos(s);}catch(e){console.warn('Photos from the backup could not all be stored',e)}
    ensureRecipeIds(s);state=s;save();showScreen('home');toast('Backup imported')};rd.readAsText(f)
}
async function resetApp(){if(typeof syncActive==='function'&&syncActive())return alert('This phone is syncing with your family. To protect the shared data, choose "Stop syncing on this phone" in Family sync first.');if(await ask('Start over on this phone?\n\nThis removes this phone\'s recipes, plan and edits. A backup is saved first (Automatic backups).',{ok:'Start over',danger:true})){try{await window.photosReady;if(typeof createSnapshot==='function')await createSnapshot('Before resetting the app')}catch(_){}localStorage.removeItem(KEY);state=loadState();showScreen('home');toast('App reset');if(typeof maybeWelcome==='function')maybeWelcome()}}

let onlineMeals={};
async function searchOnline(){
 const q=document.getElementById('onlineSearch').value.trim();
 const box=document.getElementById('onlineResults');
 if(!q){box.innerHTML='<div class="card">Enter a recipe or ingredient to search.</div>';return}
 box.innerHTML='<div class="card">Searching…</div>';
 try{
  const mode=document.getElementById('onlineMode')?.value||'name';const path=mode==='name'?'search.php?s=':mode==='ingredient'?'filter.php?i=':mode==='category'?'filter.php?c=':'filter.php?a=';const response=await fetch('https://www.themealdb.com/api/json/v1/1/'+path+encId(q),{cache:'no-store'});
  if(!response.ok)throw new Error('Search service returned '+response.status);
  const data=await response.json(); const meals=data.meals||[];
  onlineMeals=Object.fromEntries(meals.map(m=>[m.idMeal,m]));
  box.innerHTML=meals.length?meals.map(m=>`<div class="card"><div class="row between"><div class="grow"><h3>${esc(m.strMeal)}</h3><div class="muted small">${esc(m.strCategory||'Recipe')}</div></div><button class="btn" onclick="previewOnline('${m.idMeal}')">Preview</button></div></div>`).join(''):'<div class="card">No matches. Try a simpler search, such as chicken.</div>';
 }catch(err){box.innerHTML='<div class="card">Online search could not connect. Check your internet connection and try again. '+esc(err.message)+'</div>'}
}
async function previewOnline(id){
 let m=onlineMeals[id];if(!m)return;if(!m.strInstructions){try{const r=await fetch('https://www.themealdb.com/api/json/v1/1/lookup.php?i='+encId(id));const d=await r.json();m=d.meals?.[0]||m;onlineMeals[id]=m}catch(e){toast('Could not load full recipe');return}}
 const items=[];
 for(let i=1;i<=20;i++){const name=(m['strIngredient'+i]||'').trim();if(name)items.push({name,measure:(m['strMeasure'+i]||'').trim()})}
 openModal(`<div class="row between"><h2>${esc(m.strMeal)}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div><h3>Ingredients</h3><p>${items.map(x=>esc(x.measure+' '+x.name)).join('<br>')}</p><h3>Directions</h3><p style="white-space:pre-line">${esc(m.strInstructions||'No instructions supplied')}</p><div class="actions"><button class="btn" onclick="importOnline('${id}')">Add to my recipes</button>${m.strSource?`<a class="btn secondary" href="${esc(m.strSource)}" target="_blank" rel="noopener">Source</a>`:''}</div>`)
}
function importOnline(id){
 const m=onlineMeals[id];if(!m)return;
 let name=m.strMeal.trim();if(recipeIdByName(name))name+=' (Online)';
 let i=2;const base=name;while(recipeIdByName(name))name=base+' '+i++;const newId=newRecipeId();
 const ingredients=[];
 for(let j=1;j<=20;j++){
  const ingredient=(m['strIngredient'+j]||'').trim();if(!ingredient)continue;
  const measure=(m['strMeasure'+j]||'').trim();
  const match=measure.match(/^([\d.]+(?:\s*\/\s*\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(.*)$/);
  let qty=null,unit=measure;
  if(match){let v=match[1];const fraction=v.match(/^(\d+)\s*\/\s*(\d+)$/);qty=fraction?Number(fraction[1])/Number(fraction[2]):Number(v);if(!Number.isFinite(qty)){const unicode={'¼':.25,'½':.5,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875};qty=unicode[v]??null;}unit=match[2]||'ea.';}
  ingredients.push({name:ingredient,qty:qty??measure,unit:qty===null?'':unit,container:'',containerSize:null,fraction:null,catalog:null});
 }
 state.data.recipes[newId]={id:newId,name,baseServings:4,ingredients,directions:(m.strInstructions||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),tags:['Online import'],sourceType:'TheMealDB',sourceUrl:m.strSource||'',sourceId:id};
 save();closeModal();toast('Recipe imported — review quantities and package sizes');showScreen('recipes');
}



// V13 pantry helpers: stock is expressed as fractional preferred packages.
function openShopPantry(encoded){const key=decodeURIComponent(encoded),row=(window.lastShoppingRows||[]).find(x=>x.name.toLowerCase().trim()===key);if(!row)return;const pkg=row.pkg;if(!pkg){alert('Set a preferred package size for this ingredient before tracking pantry amounts.');return}const stock=Number(state.pantry?.[key]?.qty||0);openModal(`<div class="row between"><h2>🏠 ${esc(row.name)} in pantry</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div><p>Preferred package: ${fmt(pkg.qty)} ${esc(pkg.unit)} (${esc(pkg.label)})</p><p class="small">Recipe needs ${fmt(row.originalQty)} ${esc(row.unit)}. Enter the number of preferred packages currently on hand. Fractions are allowed (e.g., 0.5 for half a package).</p><label>Packages on hand</label><input id="shopPantryAmount" type="number" min="0" step="0.01" value="${stock}"><div class="actions"><button class="btn" onclick="saveShopPantry('${encoded}')">Save to pantry</button><button class="btn secondary" onclick="closeModal()">Cancel</button></div>`)}
function saveShopPantry(encoded){const key=decodeURIComponent(encoded),row=(window.lastShoppingRows||[]).find(x=>x.name.toLowerCase().trim()===key),qty=Number(document.getElementById('shopPantryAmount')?.value);if(!row||!Number.isFinite(qty)||qty<0)return alert('Enter a valid quantity.');state.pantry??={};state.pantry[key]={name:row.name,qty};save();closeModal();renderShopping();toast('Pantry quantity updated')}
function openCookChooser(){const names=Object.keys(selectedForShopping());if(!names.length)return alert('Select or plan a recipe first.');openModal('<h2>🍳 Mark a meal as cooked</h2><p class="small">Preview deductions before confirming. Pantry is not changed by meal planning.</p>'+names.map(n=>`<button class="btn secondary" style="display:block;margin:8px 0" onclick="previewCook(decodeURIComponent('${encId(n)}'))">${esc(recipeName(n))}</button>`).join('')+'<button class="btn secondary" onclick="closeModal()">Cancel</button>')}
function cookRequirements(name,servings,overrides={}){const r=state.data.recipes[name];if(!r)return [];const combined={};for(let index=0;index<r.ingredients.length;index++){const i=r.ingredients[index],key=i.name.toLowerCase().trim(),pkg=getPackage(key),q=Object.prototype.hasOwnProperty.call(overrides,index)?Number(overrides[index]):num(i.qty)*servings/r.baseServings,u=normUnit(i.unit);if(!pkg||!Number.isFinite(q)||q<0)continue;const conv=compatible(q,u,pkg.unit,key);if(!conv)continue;(combined[key]??={name:i.name,pkg,needed:0}).needed+=conv.qty}return Object.entries(combined).map(([key,v])=>({...v,key,stock:Number(state.pantry?.[key]?.qty||0),consume:Math.min(Number(state.pantry?.[key]?.qty||0),v.needed/v.pkg.qty)}))}
function previewCook(name,planKey=''){const r=state.data.recipes[name];if(!r)return;window.pendingCook={name,planKey};window.pendingCookPriorStatus=planKey?!!state.plan[planKey]?.cooked:false;window.pendingCookPriorServings=planKey?state.plan[planKey]?.cookedServings:null;const initial=planKey?Number(state.plan[planKey]?.servings||r.baseServings):Number(state.selected[name]||r.baseServings);openModal(`<h2>🍳 Cook ${esc(recipeName(name))}</h2><p class="small">Change servings, or expand ingredients to enter what you actually used. Your saved recipe will not change.</p><label>Servings cooked</label><input id="cookServings" type="number" min="0.25" step="0.25" value="${initial}" oninput="refreshCookPreview()"><details><summary>Adjust individual ingredients (optional)</summary>${r.ingredients.map((i,index)=>`<label>${esc(i.name)} (${esc(i.unit)})</label><input class="cookOverride" data-index="${index}" type="number" min="0" step="any" placeholder="Auto scaled" oninput="refreshCookPreview()">`).join('')}</details><div id="cookPreview" class="card small" aria-live="polite"></div><div class="actions"><button class="btn" onclick="confirmCook()">Confirm cooked & deduct</button><button class="btn secondary" onclick="closeModal()">Cancel</button></div>`);refreshCookPreview()}
function refreshCookPreview(){const pending=window.pendingCook;if(!pending)return;const r=state.data.recipes[pending.name],servings=Number(document.getElementById('cookServings')?.value),out=document.getElementById('cookPreview');if(!out)return;if(!Number.isFinite(servings)||servings<=0){out.textContent='Enter a positive serving amount.';return}const overrides={};document.querySelectorAll('.cookOverride').forEach(el=>{if(el.value!=='')overrides[el.dataset.index]=Number(el.value)});const items=cookRequirements(pending.name,servings,overrides);out.innerHTML='<b>Pantry deduction preview</b>'+(items.length?items.map(x=>`<p>${esc(x.name)}: use ${fmt(x.needed)} ${esc(x.pkg.unit)}; deduct ${fmt(x.consume)} preferred packages (${fmt(x.stock)} on hand)</p>`).join(''):'<p>No compatible pantry packages found. Unmatched ingredients will not be deducted.</p>')}
function confirmCook(){const pending=window.pendingCook;if(!pending||!state.data.recipes[pending.name])return;const servings=Number(document.getElementById('cookServings')?.value);if(!Number.isFinite(servings)||servings<=0)return alert('Enter valid servings.');const overrides={};let invalid=false;document.querySelectorAll('.cookOverride').forEach(el=>{if(el.value!==''){const n=Number(el.value);if(!Number.isFinite(n)||n<0)invalid=true;else overrides[el.dataset.index]=n}});if(invalid)return alert('Check individual ingredient amounts.');const items=cookRequirements(pending.name,servings,overrides);state.pantry??={};state.pantryHistory??=[];const before={};for(const x of items){if(x.consume<=0)continue;before[x.key]=structuredClone(state.pantry[x.key]);state.pantry[x.key].qty=Math.max(0,x.stock-x.consume)}state.pantryHistory.push({at:new Date().toISOString(),recipe:pending.name,servings,before});if(state.pantryHistory.length>30)state.pantryHistory.shift();if(pending.planKey&&state.plan[pending.planKey]){state.plan[pending.planKey].cooked=true;state.plan[pending.planKey].cookedServings=servings;state.pantryHistory[state.pantryHistory.length-1].planKey=pending.planKey;state.pantryHistory[state.pantryHistory.length-1].priorCooked=window.pendingCookPriorStatus||false;state.pantryHistory[state.pantryHistory.length-1].priorCookedServings=window.pendingCookPriorServings||null;}save();closeModal();toast('Pantry updated. Undo is available in Pantry.');if(typeof openRateRecipe==='function')openRateRecipe(pending.name,true)}
function undoLastCook(){const entry=state.pantryHistory?.pop();if(!entry)return alert('No recent meal to undo.');for(const [key,value] of Object.entries(entry.before))state.pantry[key]=value;if(entry.planKey&&state.plan[entry.planKey]?.recipe===entry.recipe){state.plan[entry.planKey].cooked=!!entry.priorCooked;state.plan[entry.planKey].cookedServings=entry.priorCookedServings||null;}save();renderPantry();renderShopping();toast('Last cooking deduction undone')}

// Phase 2: pantry, camera scanning and voluntary product lookup.
function renderPantry(){
 const box=document.getElementById('pantryList');if(!box)return;state.pantry??={};
 const keys=Object.keys(state.pantry).sort();box.innerHTML='<h2>On hand</h2><div class="actions"><button class="btn secondary" onclick="undoLastCook()">Undo last cooked meal</button></div>'+(keys.length?keys.map(k=>{const x=state.pantry[k];return `<div class="card"><div class="row between"><div class="row" style="align-items:center;gap:10px"><div class="ingredient-thumb">${ingredientPicture(x.name||k)}</div><b>${esc(x.name||k)}</b></div><span>${fmt(x.qty)} preferred packages ${getPackage(k)?'('+fmt(x.qty*getPackage(k).qty)+' '+esc(getPackage(k).unit)+')':''}</span></div><div class="actions"><button class="btn secondary" onclick="editPantry('${encId(k)}')">Adjust</button><button class="btn secondary" onclick="removePantry('${encId(k)}')">Remove</button></div></div>`}).join(''):'<p class="muted">No pantry items saved yet.</p>');
 const datalist=document.getElementById('pantrySuggestions');if(datalist){const names=new Set([...Object.values(state.data.recipes).flatMap(r=>r.ingredients.map(i=>i.name)),...Object.keys(state.packagePrefs||{})]);datalist.innerHTML=[...names].sort().map(n=>`<option value="${esc(n)}"></option>`).join('')}
}
function addPantry(){const name=document.getElementById('pantryName').value.trim(),qty=Number(document.getElementById('pantryQty').value);if(!name||!Number.isFinite(qty)||qty<0)return alert('Enter an ingredient and a nonnegative quantity.');state.pantry??={};const k=name.toLowerCase().trim();if(!getPackage(k))return alert('Set a preferred package size for this ingredient in Ingredients before adding pantry quantities.');state.pantry[k]={name,qty};save();document.getElementById('pantryName').value='';document.getElementById('pantryQty').value='';toast('Pantry saved')}
function editPantry(code){const k=decodeURIComponent(code),old=state.pantry?.[k];if(!old)return;const entered=prompt('Quantity on hand for '+old.name,old.qty);if(entered===null)return;const n=Number(entered);if(!Number.isFinite(n)||n<0)return alert('Enter a nonnegative quantity.');old.qty=n;save()}
async function removePantry(code){const k=decodeURIComponent(code);if(!await ask('Remove '+(state.pantry?.[k]?.name||k)+' from pantry?'))return;delete state.pantry[k];save()}
let barcodeStream=null,barcodeActive=false,barcodeBusy=false,barcodeLastSeen='',barcodeLastSeenAt=0,barcodeDetector=null,barcodeTorchOn=false;
function barcodeLinks(){state.barcodeLinks??={};return state.barcodeLinks}
function stopBarcode(){barcodeActive=false;barcodeBusy=false;if(barcodeStream){barcodeStream.getTracks().forEach(t=>t.stop());barcodeStream=null}const v=document.getElementById('barcodeVideo');if(v){v.srcObject=null;v.style.display='none'}const t=document.getElementById('barcodeTorch');if(t){t.disabled=true;t.textContent='🔦 Flashlight'}barcodeTorchOn=false}
async function toggleBarcodeTorch(){const track=barcodeStream?.getVideoTracks()?.[0],button=document.getElementById('barcodeTorch');if(!track)return;try{barcodeTorchOn=!barcodeTorchOn;await track.applyConstraints({advanced:[{torch:barcodeTorchOn}]});if(button)button.textContent=barcodeTorchOn?'🔦 Light off':'🔦 Flashlight'}catch(e){barcodeTorchOn=false;toast('Flashlight is not supported by this camera')}}
async function startBarcode(){if(!('BarcodeDetector' in window)){alert('Camera barcode detection is unavailable in this browser. You can still enter the barcode manually.');return}try{stopBarcode();barcodeStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});const v=document.getElementById('barcodeVideo');v.srcObject=barcodeStream;v.style.display='block';await v.play();barcodeActive=true;const track=barcodeStream.getVideoTracks()[0],torch=!!track?.getCapabilities?.()?.torch,button=document.getElementById('barcodeTorch');if(button)button.disabled=!torch;barcodeDetector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});async function scan(){if(!barcodeActive)return;if(!barcodeBusy&&v.readyState>=2){barcodeBusy=true;try{const hits=await barcodeDetector.detect(v);const code=hits.find(h=>/^\d{8,14}$/.test(h.rawValue))?.rawValue;if(code){const now=Date.now();if(code!==barcodeLastSeen||now-barcodeLastSeenAt>3000){barcodeLastSeen=code;barcodeLastSeenAt=now;document.getElementById('barcodeInput').value=code;stopBarcode();await lookupBarcode();return}}}catch(e){}finally{barcodeBusy=false}}if(barcodeActive)requestAnimationFrame(scan)}requestAnimationFrame(scan)}catch(e){stopBarcode();alert('Camera unavailable: '+e.message+'. Enter the barcode manually instead.')}}
function parseBarcodeSize(value){const m=String(value||'').match(/(\d+(?:[.,]\d+)?)\s*(fl\s*oz|fluid\s*ounces?|kg|g|lb|lbs|oz|ml|cl|l|liters?|litres?)\b/i);if(!m)return null;let unit=m[2].toLowerCase().replace(/\s+/g,' ');unit=({'lbs':'lb','liters':'l','litres':'l','liter':'l','litre':'l','fluid ounce':'fl oz','fluid ounces':'fl oz','cl':'ml'})[unit]||unit;let qty=Number(m[1].replace(',','.'));if(m[2].toLowerCase()==='cl')qty*=10;return {qty,unit}}
async function lookupBarcode(){const raw=document.getElementById('barcodeInput').value.trim(),box=document.getElementById('barcodeResult');if(!/^\d{8,14}$/.test(raw)){box.textContent='Enter an 8–14 digit barcode.';return}window.lastBarcodeCode=raw;window.lastBarcodeProduct='';window.lastBarcodeImage=null;window.lastBarcodeSize=null;const linked=barcodeLinks()[raw];if(linked){const name=linked.name||linked;window.lastBarcodeProduct=name;window.lastBarcodeSize=linked.scannedSize||null;box.innerHTML=`<p><b>Saved barcode:</b> ${esc(name)}</p><button class="btn" onclick="useBarcodeProduct()">Add to pantry</button><button class="btn secondary" onclick="lookupBarcodeOnline()">Refresh product details</button>`;return}await lookupBarcodeOnline()}
async function lookupBarcodeOnline(){const raw=window.lastBarcodeCode,box=document.getElementById('barcodeResult');box.textContent='Looking up product…';try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);let r;try{r=await fetch('https://world.openfoodfacts.org/api/v2/product/'+encId(raw)+'.json?fields=product_name,quantity,brands,image_url',{headers:{Accept:'application/json'},signal:controller.signal})}finally{clearTimeout(timer)}if(!r.ok)throw Error('Service unavailable');const d=await r.json();if(d.status!==1||!d.product?.product_name){box.innerHTML='Product not found in the online database. <button class="btn secondary" onclick="useBarcodeProduct()">Add manually</button>';return}const product=d.product;window.lastBarcodeProduct=product.product_name;window.lastBarcodeImage=product.image_url||null;window.lastBarcodeSize=parseBarcodeSize(product.quantity);box.innerHTML=`<p><b>${esc(product.product_name)}</b> ${esc(product.brands||'')} — ${esc(product.quantity||'package size unavailable')}</p><p class="small">Online product details are suggestions. Saved ingredient photos and preferences will not change.</p><button class="btn" onclick="useBarcodeProduct()">Choose ingredient and add to pantry</button>`}catch(e){box.innerHTML='Online lookup unavailable. <button class="btn secondary" onclick="useBarcodeProduct()">Add manually</button>'}}
function useBarcodeProduct(){const product=window.lastBarcodeProduct||'',linked=barcodeLinks()[window.lastBarcodeCode],names=[...new Set([...Object.keys(state.packagePrefs||{}),...Object.values(state.data.recipes).flatMap(r=>r.ingredients.map(i=>i.name)),...Object.keys(state.pantry||{}),...Object.keys(state.itemMeta||{})])],options=names.filter(n=>getPackage(n)).sort().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');openModal(`<h2>📷 Add scanned product to pantry</h2><p>Scanned: <b>${esc(product||window.lastBarcodeCode||'Manual barcode')}</b></p><p class="small">Choose an ingredient or create a new one. Scanning will never replace an existing picture, package preference, or name.</p><label>Matching ingredient</label><select id="scanCatalogItem" onchange="updateScanPackageInfo()"><option value="">Select ingredient</option>${options}<option value="__new__">＋ Add new ingredient…</option></select><div id="scanNewIngredient" class="card" style="display:none"><h3>New ingredient</h3><label>Ingredient name</label><input id="scanNewName" type="text" placeholder="New ingredient name" oninput="updateScanPreview();updateScanPhotoOffer()"><div class="formrow"><div><label>Package quantity</label><input id="scanNewQty" oninput="updateScanPackageInfo()" type="number" min="0.001" step="any" placeholder="e.g. 16"></div><div><label>Unit</label><select id="scanNewUnit" onchange="updateScanPackageInfo()"><option value="oz">oz</option><option value="lb">lb</option><option value="ea">each</option><option value="fl oz">fl oz</option><option value="cup">cup</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">liter</option></select></div></div><label>Package type</label><input id="scanNewLabel" type="text" placeholder="e.g. bag, box, bottle"></div><div id="scanPackageInfo" class="card small muted" aria-live="polite">Select an ingredient to see its preferred package.</div><label>How do you want to enter what you have?</label><select id="scanEntryMode" onchange="updateScanPackageInfo()"><option value="packages">Number of preferred packages (fractions allowed)</option><option value="amount">Actual amount remaining (for opened packages)</option></select><label id="scanAmountLabel">Packages to add</label><input id="scanAddQty" type="number" min="0.001" step="any" value="1" oninput="updateScanPreview()"><div class="actions"><button class="btn secondary" onclick="setScanQuickQty(1)">+1</button><button class="btn secondary" onclick="setScanQuickQty(2)">+2</button><button class="btn secondary" onclick="setScanQuickQty(3)">+3</button></div><div id="scanPreview" class="small muted" aria-live="polite"></div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="scanContinue" checked style="width:auto">Keep scanning after adding</label><div id="scanPhotoOffer" class="card" style="display:none"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="scanAddPhoto" style="width:auto"> Add a picture after saving this ingredient</label><p class="small muted">You can take a photo or choose one from your gallery. Existing pictures are never replaced by scanning.</p></div><div class="actions"><button class="btn" id="scanSaveButton" onclick="confirmScannedPantry()">Add to pantry</button><button class="btn secondary" onclick="closeModal()">Cancel</button></div>`);const select=document.getElementById('scanCatalogItem');if(linked){const name=linked.name||linked;if([...select.options].some(o=>o.value.toLowerCase()===name.toLowerCase()))select.value=[...select.options].find(o=>o.value.toLowerCase()===name.toLowerCase()).value}if(!select.value&&product){const match=names.find(n=>n.toLowerCase()===product.toLowerCase());if(match&&getPackage(match))select.value=match}if(!select.value){select.value='__new__';document.getElementById('scanNewName').value=product;const size=window.lastBarcodeSize;if(size){document.getElementById('scanNewQty').value=size.qty;const units=document.getElementById('scanNewUnit');if([...units.options].some(o=>o.value===size.unit))units.value=size.unit}document.getElementById('scanNewLabel').value='package'}updateScanPackageInfo();updateScanPhotoOffer()}
function updateScanPhotoOffer(){
 const selected=document.getElementById('scanCatalogItem')?.value;
 const name=selected==='__new__'?document.getElementById('scanNewName')?.value.trim():selected;
 const key=(name||'').toLowerCase().trim();
 const pictureKey=PACKAGE_PICTURE_ALIASES[key]||key;
 const alreadyHasPicture=!!(state.itemMeta?.[key]?.imageUrl||PACKAGE_PICTURES[pictureKey]);
 const offer=document.getElementById('scanPhotoOffer');
 if(offer)offer.style.display=key&&!alreadyHasPicture?'block':'none';
 const checkbox=document.getElementById('scanAddPhoto');if(checkbox&&alreadyHasPicture)checkbox.checked=false;
}
function setScanQuickQty(n){const input=document.getElementById('scanAddQty');document.getElementById('scanEntryMode').value='packages';updateScanPackageInfo();input.value=String(n);updateScanPreview()}
function updateScanPackageInfo(){updateScanPhotoOffer();const selection=document.getElementById('scanCatalogItem')?.value,isNew=selection==='__new__',fields=document.getElementById('scanNewIngredient');if(fields)fields.style.display=isNew?'block':'none';const pkg=isNew?{qty:Number(document.getElementById('scanNewQty')?.value),unit:document.getElementById('scanNewUnit')?.value,label:document.getElementById('scanNewLabel')?.value||'package'}:selection&&getPackage(selection),info=document.getElementById('scanPackageInfo'),mode=document.getElementById('scanEntryMode')?.value,amount=document.getElementById('scanAddQty'),label=document.getElementById('scanAmountLabel');if(!info||!amount)return;if(!pkg||!(Number(pkg.qty)>0)){info.textContent=isNew?'Enter the new ingredient package quantity and unit.':'Choose an ingredient to view its preferred package.';label.textContent='Amount to add';document.getElementById('scanPreview').textContent='';return}const qty=Number(pkg.qty),unit=String(pkg.unit||'units'),container=String(pkg.label||'package'),key=(isNew?document.getElementById('scanNewName')?.value:selection||'').toLowerCase().trim(),existing=Number(state.pantry?.[key]?.qty||0);info.innerHTML=`<b>Preferred package: ${esc(container)}</b><br>Saved size: ${fmt(qty)} ${esc(unit)} per ${esc(container)}<br>Currently in pantry: ${fmt(existing)} preferred packages (${fmt(existing*qty)} ${esc(unit)})<p class="small">Online suggestions will not overwrite this preferred package or your picture.</p>`;label.textContent=mode==='packages'?'Preferred packages to add':'Actual '+unit+' remaining to add';amount.value=mode==='packages'?'1':String(qty);updateScanPreview()}
function updateScanPreview(){const selection=document.getElementById('scanCatalogItem')?.value,pkg=selection==='__new__'?{qty:Number(document.getElementById('scanNewQty')?.value),unit:document.getElementById('scanNewUnit')?.value}:selection&&getPackage(selection),v=Number(document.getElementById('scanAddQty')?.value),mode=document.getElementById('scanEntryMode')?.value,out=document.getElementById('scanPreview');if(!out)return;if(!pkg||!(Number(pkg.qty)>0)||!Number.isFinite(v)||v<=0){out.textContent='Enter a valid positive amount and package size.';return}const packs=mode==='packages'?v:v/Number(pkg.qty);out.textContent='Adding '+fmt(packs)+' preferred package(s), equivalent to '+fmt(packs*Number(pkg.qty))+' '+pkg.unit+'.'}
let scannedPantrySaving=false;
function confirmScannedPantry(){
 if(scannedPantrySaving)return;
 const selection=document.getElementById('scanCatalogItem')?.value,isNew=selection==='__new__';
 const name=isNew?document.getElementById('scanNewName')?.value.trim():selection;
 const pkg=isNew?{qty:Number(document.getElementById('scanNewQty')?.value),unit:document.getElementById('scanNewUnit')?.value,label:document.getElementById('scanNewLabel')?.value.trim()}:name&&getPackage(name);
 const entered=Number(document.getElementById('scanAddQty')?.value),mode=document.getElementById('scanEntryMode')?.value;
 const again=!!document.getElementById('scanContinue')?.checked;
 const addPhoto=!!document.getElementById('scanAddPhoto')?.checked&&document.getElementById('scanPhotoOffer')?.style.display!=='none';
 if(!name||!pkg||!(Number(pkg.qty)>0)||!Number.isFinite(entered)||entered<=0)return alert('Select an ingredient, complete its package details and enter a valid positive amount.');
 if(isNew&&(!pkg.unit||!pkg.label))return alert('Enter a unit and package type.');
 if(isNew&&getPackage(name))return alert('That ingredient already exists. Select it instead.');
 const k=name.toLowerCase().trim(),qty=mode==='packages'?entered:entered/Number(pkg.qty);
 const oldPackage=state.packagePrefs?.[k],oldPantry=state.pantry?.[k],code=window.lastBarcodeCode;
 const oldLink=code?barcodeLinks()[code]:undefined;
 const button=document.getElementById('scanSaveButton');scannedPantrySaving=true;if(button){button.disabled=true;button.textContent='Saving…'}
 try{
  if(isNew){state.packagePrefs??={};state.packagePrefs[k]={qty:pkg.qty,unit:pkg.unit,label:pkg.label};if(!addPhoto&&/^https:\/\//i.test(window.lastBarcodeImage||'')&&!state.itemMeta?.[k]?.imageUrl){state.itemMeta??={};state.itemMeta[k]={...(state.itemMeta[k]||{}),imageUrl:window.lastBarcodeImage}}}
  state.pantry??={};state.pantry[k]={name:oldPantry?.name||name,qty:Number(oldPantry?.qty||0)+qty};
  if(code)barcodeLinks()[code]={name:oldPantry?.name||name,scannedSize:window.lastBarcodeSize||null};
  // Do not touch state.itemMeta: barcode lookup must not overwrite pictures or other saved details.
  // Commit first: only a failed storage write should roll back the pantry change.
  if(!writeState())storageFullWarning();
 }catch(error){
  if(isNew){if(oldPackage)state.packagePrefs[k]=oldPackage;else delete state.packagePrefs[k]}
  if(oldPantry)state.pantry[k]=oldPantry;else delete state.pantry[k];
  if(code){if(oldLink)barcodeLinks()[code]=oldLink;else delete barcodeLinks()[code]}
  scannedPantrySaving=false;if(button){button.disabled=false;button.textContent='Add to pantry'}
  console.error('Pantry storage write failed',error);alert('Could not save to pantry. Your browser rejected the storage write. Export a backup if possible and check available site storage.');return;
 }
 scannedPantrySaving=false;
 // Saving has already succeeded. UI or optional cloud-sync errors cannot undo it.
 try{if(typeof queueCloudSave==='function')queueCloudSave()}catch(error){console.error('Pantry saved locally; cloud sync failed',error)}
 try{closeModal();showScreen('pantry')}catch(error){console.error('Pantry saved; screen refresh failed',error)}
 try{renderShopping()}catch(error){console.error('Pantry saved; shopping refresh failed',error)}
 const result=document.getElementById('barcodeResult');
 if(result)result.innerHTML=`<div class="card" style="border-color:var(--olive)"><b>✓ ${esc(name)} added to pantry</b><p>${fmt(qty)} package(s) added successfully.</p><div class="actions">${addPhoto?`<button class="btn" onclick="editIngredientPhoto('${encId(k)}')">📷 Add picture</button>`:''}${again?'<button class="btn secondary" onclick="resetScanForNext()">Scan next item</button>':''}</div></div>`;
 try{toast('✓ '+name+' added to pantry')}catch(error){console.warn('Success toast unavailable',error)}
 if(again&&!addPhoto){try{resetScanForNext()}catch(error){console.warn('Saved; reopen scanner for next item',error)}}
}
function resetScanForNext(){
 const input=document.getElementById('barcodeInput');if(input)input.value='';
 const result=document.getElementById('barcodeResult');if(result)result.textContent='Saved! Ready for the next product.';
 window.lastBarcodeCode='';window.lastBarcodeProduct='';window.lastBarcodeSize=null;
 startBarcode();
}

// Built-in ingredient illustrations arrive after the first screen is up.
window.addEventListener('gingham-pictures',()=>{try{refreshSavedViews()}catch(_){}});
window.addEventListener('load',()=>setTimeout(()=>loadScriptOnce('ingredient-pictures.js?v=24').catch(()=>{}),200));

// ---------- First time on a new phone: how do you want to start? ----------
function maybeWelcome(){if(state.welcome&&!(typeof syncActive==='function'&&syncActive()))setTimeout(openWelcome,350)}
function openWelcome(){
 const n=Object.keys(STARTER_RECIPES).length;
 openModal(`<div class="welcome"><div class="welcome-mark" aria-hidden="true">🍽️</div><h2>Welcome to Gingham</h2>
  <p class="muted">Plan meals, build the shopping list and keep your family's recipes in one place. How would you like to start?</p>
  <button class="welcome-choice" onclick="startKitchen('examples')"><b>📖 Start with ${n} example recipes</b><span>Weeknight family favorites you can edit or delete. Good for trying things out.</span></button>
  <button class="welcome-choice" onclick="startKitchen('empty')"><b>✨ Start with an empty recipe box</b><span>Add your own recipes, import from websites, or snap a photo of a recipe card.</span></button>
  <button class="welcome-choice" onclick="startKitchen('join')"><b>👨‍👩‍👧 Join my family's kitchen</b><span>Someone already uses Gingham? Sign in and enter their join code to share everything.</span></button>
  <button class="welcome-choice" onclick="startKitchen('restore')"><b>📂 Restore a backup file</b><span>Moving from another phone with a Gingham backup.</span></button></div>`);
}
function startKitchen(how){
 delete state.welcome;
 if(how==='examples'){Object.assign(state.data.recipes,clone(STARTER_RECIPES));ensureRecipeIds(state)}
 save();closeModal();
 if(how==='join'){showScreen('settings');setTimeout(()=>document.getElementById('familyCard')?.scrollIntoView({block:'start',behavior:'smooth'}),200);toast('Create an account or sign in, then enter the join code')}
 else if(how==='restore'){showScreen('settings');setTimeout(()=>document.getElementById('importFile')?.click(),250)}
 else if(how==='empty'){showScreen('recipes');toast('Tap ＋ Add or 🔗 Import to add your first recipe')}
 else {showScreen('recipes');toast('Added '+Object.keys(STARTER_RECIPES).length+' example recipes')}
}
window.addEventListener('load',()=>maybeWelcome());
