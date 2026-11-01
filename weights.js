// Ingredient weights: how much 1 cup and 1 "each" of an ingredient weigh. Shopping and nutrition use them to turn
// "2 cups shredded cheese" or "3 onions" into ounces and pounds. Filled from USDA measurements, editable by hand.
// itemMeta[key].gramsPerCup / gramsPerEach; weightSource = {cup:{g,label}, each:{g,label}} remembers what USDA said,
// so a number someone typed is never replaced.

function usedIngredients() {
  const out = new Map();
  for (const r of Object.values(state.data.recipes || {})) for (const i of r.ingredients || []) {
    if (!(num(i.qty) > 0) || /^(tap |cold |warm |hot |boiling |ice )?water$/i.test(i.name)) continue;
    const key = ingredientKey(i.name), kind = unitKind(unitName(i.unit || 'ea.'));
    const e = out.get(key) || { key, name: i.name, cup: false, each: false, recipes: new Set() };
    if (kind === 'volume') e.cup = true;
    if (kind === 'count') e.each = true;
    e.recipes.add(r.id); out.set(key, e);
  }
  for (const e of out.values()) {   // the package unit matters too: a recipe in cups, bought by the pound
    const pk = getPackage(e.key), pkind = pk ? unitKind(unitName(pk.unit)) : null;
    if (pkind === 'count' && !e.each) e.each = e.cup;
    e.needCup = e.cup && pkind && pkind !== 'volume';
    e.needEach = e.each && pkind && pkind !== 'count';
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function weightInfo(key, field) {
  const m = state.itemMeta?.[key] || {}, own = Number(m[field]), src = m.weightSource?.[field === 'gramsPerCup' ? 'cup' : 'each'];
  if (own > 0) return { g: own, from: src && Math.abs(src.g - own) < 0.01 ? 'USDA' : 'yours', label: src?.label };
  const t = field === 'gramsPerCup' ? gramsPerCup(key) : gramsEach(key);
  return t ? { g: t.value, from: 'typical' } : { g: null, from: null };
}
async function fillWeightsFromUSDA() {
  const msg = t => { const el = document.getElementById('wtMsg'); if (el) { el.className = 'small muted'; el.textContent = t } };
  const list = usedIngredients().filter(e => e.cup || e.each);
  if (!list.length) return toast('No recipe ingredients need weights');
  try {
    // 1. make sure each ingredient is matched to a USDA food (the same match nutrition facts use)
    const unmatched = list.filter(e => !state.itemMeta?.[e.key]?.nutrition?.fdcId).map(e => e.key);
    for (let i = 0; i < unmatched.length; i += 25) {
      msg(`Matching ingredients to the USDA database… ${Math.min(i + 25, unmatched.length)} of ${unmatched.length}`);
      const batch = unmatched.slice(i, i + 25), j = await callHelper({ action: 'nutrition', terms: batch });
      state.itemMeta ??= {};
      for (const k of batch) { const x = (j.results?.[k] || [])[0]; if (x) state.itemMeta[k] = { ...(state.itemMeta[k] || {}), nutrition: { fdcId: x.id, name: x.name, per100g: x.per100g, at: new Date().toISOString() } } }
    }
    // 2. their measured weights
    const byId = new Map();
    for (const e of list) { const id = state.itemMeta?.[e.key]?.nutrition?.fdcId; if (id) (byId.get(id) || byId.set(id, []).get(id)).push(e) }
    const ids = [...byId.keys()]; let cups = 0, eaches = 0;
    for (let i = 0; i < ids.length; i += 20) {
      msg(`Getting measured weights… ${Math.min(i + 20, ids.length)} of ${ids.length}`);
      const j = await callHelper({ action: 'portions', fdcIds: ids.slice(i, i + 20) });
      for (const id of ids.slice(i, i + 20)) {
        const w = j.results?.[id]; if (!w) continue;
        for (const e of byId.get(id)) {
          const m = state.itemMeta[e.key] = { ...(state.itemMeta[e.key] || {}) }, src = m.weightSource = { ...(m.weightSource || {}) };
          const mine = (field, s) => Number(m[field]) > 0 && !(s && Math.abs(s.g - Number(m[field])) < 0.01);   // typed by someone: keep it
          if (w.cup && !mine('gramsPerCup', src.cup)) { m.gramsPerCup = w.cup.g; src.cup = w.cup; cups++ }
          if (w.each && !mine('gramsPerEach', src.each)) { m.gramsPerEach = w.each.g; src.each = w.each; eaches++ }
        }
      }
    }
    if (typeof refreshAllRecipeConversions === 'function') refreshAllRecipeConversions();
    save(); renderWeights();
    const left = usedIngredients().filter(e => (e.needCup && !weightInfo(e.key, 'gramsPerCup').g) || (e.needEach && !weightInfo(e.key, 'gramsPerEach').g)).length;
    const el = document.getElementById('wtMsg'); if (el) { el.className = 'small ing-ok'; el.textContent = `✓ Filled in ${cups} cup weight${cups === 1 ? '' : 's'} and ${eaches} “each” weight${eaches === 1 ? '' : 's'} from USDA.${left ? ` ${left} still need a number: they're marked below.` : ''}` }
  } catch (e) {
    const el = document.getElementById('wtMsg'); if (el) { el.className = 'small warning'; el.textContent = e.signin ? 'Sign in under ⚙️ Family sync to look up weights.' : /web address/i.test(e.message) ? 'Paste the newest recipe-import.ts into your Supabase helper and Deploy, then try again.' : e.message }
  }
}
let weightFilter = '';
function weightStyles() {
  if (document.getElementById('wtCss')) return;
  const s = document.createElement('style'); s.id = 'wtCss';
  s.textContent = `#wtList{margin-top:10px}.wt-row{padding:10px 0;border-bottom:1px solid var(--line,#E8DCC8)}.wt-row>b{margin-right:8px}
  .wt-fields{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:6px}.wt-field{display:grid;grid-template-columns:auto 84px auto;align-items:center;gap:4px 6px;font-size:.9rem}
  .wt-field input{width:84px;padding:6px 8px;margin:0}.wt-field .wt-g{color:var(--muted,#7A6B5E)}.wt-src{grid-column:1/-1;font-size:.75rem;color:var(--muted,#7A6B5E)}
  .wt-src.USDA{color:#3C7A4B}.wt-src.yours{color:var(--tomato,#C8412F)}.wt-field.need input{border-color:var(--tomato,#C8412F)}.wt-src.need{color:var(--tomato,#C8412F);font-weight:600}`;
  document.head.appendChild(s);
}
function openWeights() {
  weightStyles();
  openModal(`<div class="row between"><h2>Ingredient weights</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">How much 1 cup and 1 of each weighs. Used to turn recipe amounts into what you buy (cups of cheese → ounces, 3 onions → pounds) and for nutrition.</p>
    <div class="actions"><button class="btn" onclick="fillWeightsFromUSDA()">🔎 Fill in from USDA</button></div>
    <div id="wtMsg" class="small muted" role="status"></div>
    <input class="search" id="wtSearch" placeholder="Find an ingredient" value="${esc(weightFilter)}" oninput="weightFilter=this.value;renderWeights()">
    <div id="wtList"></div>
    <p class="tiny muted">USDA = measured by the USDA. Typical = Gingham's built-in estimate. Yours = typed by your family, never replaced automatically.</p>`);
  renderWeights();
}
function renderWeights() {
  const box = document.getElementById('wtList'); if (!box) return;
  const f = weightFilter.trim().toLowerCase();
  const list = usedIngredients().filter(e => (e.cup || e.each) && (!f || e.name.toLowerCase().includes(f)));
  const field = (e, kind) => {
    const fieldName = kind === 'cup' ? 'gramsPerCup' : 'gramsPerEach', w = weightInfo(e.key, fieldName), need = kind === 'cup' ? e.needCup : e.needEach;
    return `<label class="wt-field ${!w.g && need ? 'need' : ''}"><span>${kind === 'cup' ? '1 cup' : '1 each'}</span>
      <input type="number" min="0" step="any" inputmode="decimal" value="${w.from === 'yours' || w.from === 'USDA' ? esc(w.g) : ''}" placeholder="${w.g ? '≈ ' + Math.round(w.g) : '?'}" onchange="setWeight(decodeURIComponent('${encId(e.key)}'),'${fieldName}',this.value)" aria-label="Grams in ${kind === 'cup' ? 'one cup' : 'one'} of ${esc(e.name)}"><span class="wt-g">g</span>
      ${w.from ? `<small class="wt-src ${w.from}" title="${esc(w.label || '')}">${w.from}${w.label ? ' · ' + esc(w.label) : ''}</small>` : need ? '<small class="wt-src need">needed</small>' : ''}</label>`;
  };
  box.innerHTML = list.length ? list.map(e => `<div class="wt-row"><b>${esc(e.name)}</b><span class="tiny muted">${e.recipes.size} recipe${e.recipes.size === 1 ? '' : 's'}</span>
    <div class="wt-fields">${e.cup ? field(e, 'cup') : ''}${e.each ? field(e, 'each') : ''}</div></div>`).join('') : '<p class="small muted">No ingredients measured in cups or by count.</p>';
}
function setWeight(key, fieldName, value) {
  state.itemMeta ??= {}; const m = state.itemMeta[key] = { ...(state.itemMeta[key] || {}) }, v = Number(value);
  if (v > 0) m[fieldName] = Math.round(v * 10) / 10; else delete m[fieldName];
  if (typeof refreshAllRecipeConversions === 'function') refreshAllRecipeConversions();
  save(); renderWeights(); toast('Saved');
}
