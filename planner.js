// Planning preferences for "Suggest empty meals" (v21): time limits, a weekly budget, and recipe groups.
'use strict';

const DAY_SHORT = { Sunday: 'Su', Monday: 'Mo', Tuesday: 'Tu', Wednesday: 'We', Thursday: 'Th', Friday: 'Fr', Saturday: 'Sa' };
const WEEKEND = new Set(['Saturday', 'Sunday']);
const TIME_CHOICES = [null, 15, 20, 30, 45, 60, 90, 120];
function planPrefs() {
  const p = state.planPrefs || {};
  return { weekdayMax: p.weekdayMax ?? null, weekendMax: p.weekendMax ?? null, weeklyBudget: p.weeklyBudget ?? null,
    favorGroups: (p.favorGroups || []).filter(id => state.recipeGroups?.[id]), avoidGroups: (p.avoidGroups || []).filter(id => state.recipeGroups?.[id]),
    rules: (p.rules || []).filter(r => r && state.recipeGroups?.[r.group] && r.days?.length && MEALS.includes(r.meal)),
    skipWontEat: p.skipWontEat !== false };
}
function prefsSummary() {
  const p = planPrefs(), bits = [];
  if (p.weekdayMax) bits.push(`weekdays ≤ ${formatMinutes(p.weekdayMax)}`);
  if (p.weekendMax) bits.push(`weekends ≤ ${formatMinutes(p.weekendMax)}`);
  if (p.weeklyBudget) bits.push(`about $${Number(p.weeklyBudget).toFixed(0)} a week`);
  for (const r of p.rules) bits.push(`${daysLabel(r.days)} ${r.meal.toLowerCase()}: ${groupName(r.group)}`);
  if (p.favorGroups.length) bits.push('more ' + p.favorGroups.map(groupName).join(', '));
  if (p.avoidGroups.length) bits.push('no ' + p.avoidGroups.map(groupName).join(', '));
  return bits.join(' · ');
}
function daysLabel(days) {
  const order = DAYS.filter(d => days.includes(d));
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (order.length === 7) return 'Every day';
  if (order.length === 5 && weekdays.every(d => order.includes(d))) return 'Weekdays';
  if (order.length === 2 && order.every(d => WEEKEND.has(d))) return 'Weekends';
  // runs like Mon–Thu
  const idx = order.map(d => DAYS.indexOf(d));
  if (idx.length > 2 && idx.every((v, i) => !i || v === idx[i - 1] + 1)) return `${order[0].slice(0, 3)}–${order[order.length - 1].slice(0, 3)}`;
  return order.map(d => d.slice(0, 3)).join(', ');
}

// ---------- Preferences screen ----------
let prefsDraft = null;
function openPlanPrefs() {
  prefsDraft = clone(planPrefs());
  renderPlanPrefs();
}
function renderPlanPrefs() {
  const p = prefsDraft, groups = groupList();
  const timeSel = (id, v) => `<select id="${id}">${TIME_CHOICES.map(t => `<option value="${t ?? ''}" ${t === (v ?? null) ? 'selected' : ''}>${t ? 'Up to ' + formatMinutes(t) : 'Any time'}</option>`).join('')}</select>`;
  const chip = (list, id, label) => `<button type="button" class="chip ${p[list].includes(id) ? 'on' : ''}" aria-pressed="${p[list].includes(id)}" onclick="togglePrefGroup('${list}','${id}')">${esc(label)}</button>`;
  openModal(`<div class="row between"><h2>Planning preferences</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">Used by <b>Suggest empty meals</b>. If nothing fits a preference, it's relaxed for that meal and you'll see a note.</p>
    <div class="card"><h3>⏱ Time</h3><p class="small muted">Prep + cook time. Recipes without times can still be picked.</p>
      <div class="formrow"><div><label for="ppWeekday">Weekdays (Mon–Fri)</label>${timeSel('ppWeekday', p.weekdayMax)}</div><div><label for="ppWeekend">Weekends</label>${timeSel('ppWeekend', p.weekendMax)}</div></div></div>
    <div class="card"><h3>💰 Money</h3><label for="ppBudget">Weekly grocery budget for planned meals ($)</label>
      <input id="ppBudget" type="number" min="0" step="5" inputmode="decimal" placeholder="No limit" value="${esc(p.weeklyBudget ?? '')}">
      <p class="tiny muted">Uses the price estimates on your ingredients. Cheaper recipes are chosen when needed to stay under it.</p></div>
    <div class="card"><h3>👪 Family</h3><p class="small muted">Recipes your family rated 👍 are picked more, 👎 less.</p>
      <label class="check-line"><input id="ppWontEat" type="checkbox" ${p.skipWontEat ? 'checked' : ''}> Skip recipes with something a person won't eat</label>
      ${typeof peopleList === 'function' && !peopleList().length ? `<p class="tiny muted">Add people and what they won't eat under ⚙️ Settings → Who eats at your table.</p>` : ''}</div>
    <div class="card"><h3>📁 Groups</h3>
      ${groups.length ? `<label>Pick more often</label><div class="chip-row">${groups.map(g => chip('favorGroups', g.id, groupName(g.id))).join('')}</div>
      <label>Never pick automatically</label><div class="chip-row">${groups.map(g => chip('avoidGroups', g.id, groupName(g.id))).join('')}</div>
      <label>Specific days</label><p class="tiny muted">For example, weekday dinners from “Weeknight dinners”, Sunday dinner from “Slow cooker”.</p>
      <div id="ppRules">${p.rules.map((r, i) => ruleRowHTML(r, i)).join('')}</div>
      <div class="actions"><button type="button" class="btn secondary" onclick="addPrefRule()">＋ Add a day rule</button></div>`
      : `<p class="small muted">Make recipe groups on the Recipes screen (like “Weeknight dinners”), then choose here which days use them.</p>`}</div>
    <div class="actions"><button class="btn" onclick="savePlanPrefs()">Save preferences</button><button class="btn secondary" onclick="closeModal()">Cancel</button></div>`);
}
function ruleRowHTML(r, i) {
  const groups = groupList();
  return `<div class="rule-row card" data-rule="${i}">
    <div class="day-chips" role="group" aria-label="Days">${DAYS.map(d => `<button type="button" class="day-chip ${r.days.includes(d) ? 'on' : ''}" aria-pressed="${r.days.includes(d)}" aria-label="${d}" onclick="toggleRuleDay(${i},'${d}')">${DAY_SHORT[d]}</button>`).join('')}</div>
    <div class="row rule-pick"><select aria-label="Meal" onchange="prefsDraft.rules[${i}].meal=this.value">${MEALS.map(m => `<option ${m === r.meal ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <span class="muted">from</span><select aria-label="Group" onchange="prefsDraft.rules[${i}].group=this.value">${groups.map(g => `<option value="${g.id}" ${g.id === r.group ? 'selected' : ''}>${esc(groupName(g.id))}</option>`).join('')}</select>
    <button type="button" class="iconbtn" aria-label="Remove rule" onclick="removePrefRule(${i})">✕</button></div></div>`;
}
function readPrefInputs() {
  if (!prefsDraft) return;
  const v = id => document.getElementById(id)?.value ?? '';
  prefsDraft.weekdayMax = v('ppWeekday') ? Number(v('ppWeekday')) : null;
  prefsDraft.weekendMax = v('ppWeekend') ? Number(v('ppWeekend')) : null;
  prefsDraft.weeklyBudget = v('ppBudget') !== '' && Number(v('ppBudget')) > 0 ? Number(v('ppBudget')) : null;
  const we = document.getElementById('ppWontEat'); if (we) prefsDraft.skipWontEat = we.checked;
}
function togglePrefGroup(list, id) {
  readPrefInputs();
  const other = list === 'favorGroups' ? 'avoidGroups' : 'favorGroups';
  const on = !prefsDraft[list].includes(id);
  prefsDraft[list] = on ? [...prefsDraft[list], id] : prefsDraft[list].filter(x => x !== id);
  if (on) prefsDraft[other] = prefsDraft[other].filter(x => x !== id);   // can't be both
  renderPlanPrefs();
}
function addPrefRule() {
  readPrefInputs();
  const used = new Set(prefsDraft.rules.map(r => r.group)), g = groupList().find(x => !used.has(x.id)) || groupList()[0];
  prefsDraft.rules.push({ days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], meal: 'Dinner', group: g.id });
  renderPlanPrefs();
}
function removePrefRule(i) { readPrefInputs(); prefsDraft.rules.splice(i, 1); renderPlanPrefs() }
function toggleRuleDay(i, d) {
  readPrefInputs();
  const r = prefsDraft.rules[i]; r.days = r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d];
  renderPlanPrefs();
}
function savePlanPrefs() {
  readPrefInputs();
  const p = prefsDraft;
  p.rules = p.rules.filter(r => r.days.length);
  state.planPrefs = p; prefsDraft = null;
  save(); closeModal(); toast('Planning preferences saved');
  if (typeof renderPlanner === 'function') renderPlanner();
}

// ---------- Suggest empty meals ----------
function recipeCostFor(id, servings) { const c = typeof recipeCost === 'function' ? recipeCost(id, servings) : null; return c ? c.total : null }
function smartFillPlan() {
  const p = planPrefs(), ids = Object.keys(state.data.recipes).filter(Boolean);
  const avoid = new Set(p.avoidGroups), favor = new Set(p.favorGroups), favorites = new Set(state.favorites);
  const inGroup = (id, g) => recipeGroupIds(state.data.recipes[id]).includes(g);
  // the week on screen; days already past are left alone
  const dates = weekDates(), weekSet = new Set(dates), today = todayISO();
  const inWeek = Object.entries(state.plan).filter(([k, v]) => weekSet.has(planDateOf(k)) && v?.recipe && state.data.recipes[v.recipe]);
  const used = new Set(inWeek.map(([, v]) => v.recipe)), recent = recentlyPlanned(14);
  // spending so far on meals already planned this week
  let spent = 0;
  for (const [, v] of inWeek) spent += recipeCostFor(v.recipe, v.servings) || 0;
  const slots = [];
  for (const date of dates) if (date >= today) for (const meal of MEALS) if (!planEntries(date, meal).length) slots.push({ date, day: dayNameOf(date), meal });
  const notes = []; let added = 0;
  slots.forEach((slot, n) => {
    const { date, day, meal } = slot, limit = WEEKEND.has(day) ? p.weekendMax : p.weekdayMax;
    const rule = p.rules.find(r => r.meal === meal && r.days.includes(day));
    let pool = ids.filter(id => recipeFitsMeal(id, meal) && !recipeGroupIds(state.data.recipes[id]).some(g => avoid.has(g)));
    if (!pool.length) return;
    const step = (list, test, why) => { const next = list.filter(test); if (next.length) return next; if (why) notes.push(`${dayTitle(date)} ${meal.toLowerCase()}: ${why}`); return list };
    if (rule) pool = step(pool, id => inGroup(id, rule.group), `nothing in ${groupName(rule.group)} fits, picked from all recipes`);
    if (p.skipWontEat && typeof wontEatConflicts === 'function') pool = step(pool, id => !wontEatConflicts(id).length, 'every option has something someone won\'t eat');
    if (limit) pool = step(pool, id => { const t = recipeTimes(state.data.recipes[id]).total; return !t || t <= limit }, `nothing fits ${formatMinutes(limit)}, picked the closest`);
    pool = step(pool, id => !used.has(id), '');   // repeats only when there's no other choice
    const left = slots.length - n, target = p.weeklyBudget ? Math.max(0, p.weeklyBudget - spent) / left : null;
    const scored = pool.map(id => {
      const r = state.data.recipes[id], t = recipeTimes(r).total, cost = recipeCostFor(id, r.baseServings);
      let s = Math.random() * 1.5;                                   // variety from week to week
      if (favorites.has(id)) s += 3;
      if (typeof recipeRatings === 'function') { const rt = recipeRatings(id), n = Math.max(1, raters().length); s += rt.likes.length / n * 4 - rt.dislikes.length / n * 6 }
      if (recipeGroupIds(r).some(g => favor.has(g))) s += 2.5;
      if (limit && t && t > limit) s -= (t - limit) / 10;            // only when nothing fit: closest wins
      if (limit && !t) s -= 0.5;
      if (recent.has(id)) s -= 1.5;                                  // had it in the last two weeks
      if (target != null) { if (cost == null) s -= 1; else if (cost > target) s -= Math.min(6, (cost - target) / Math.max(target, 1) * 4); else s += 0.5 }
      return { id, s, cost };
    }).sort((a, b) => b.s - a.s);
    const pick = scored[0];
    state.plan[`${date}|${meal}|auto${Date.now().toString(36)}${added}`] = { recipe: pick.id, servings: state.data.recipes[pick.id].baseServings || 4 };
    used.add(pick.id); spent += pick.cost || 0; added++;
  });
  if (!added) return toast(slots.length ? 'No recipes match the empty meals' : 'Every meal from today on is already planned');
  save();
  const budgetLine = p.weeklyBudget ? ` · est. $${spent.toFixed(0)} of your $${Number(p.weeklyBudget).toFixed(0)} budget` : '';
  if (notes.length || (p.weeklyBudget && spent > p.weeklyBudget)) {
    openModal(`<div class="row between"><h2>Filled ${added} meal${added === 1 ? '' : 's'}</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
      ${p.weeklyBudget ? `<p class="${spent > p.weeklyBudget ? 'warning' : 'muted'} small">Estimated groceries for planned meals: <b>$${spent.toFixed(2)}</b> (budget $${Number(p.weeklyBudget).toFixed(2)}). Estimates only cover ingredients that have prices.</p>` : ''}
      ${notes.length ? `<p class="small">Some preferences couldn't be met:</p><ul class="small">${[...new Set(notes)].slice(0, 12).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="actions"><button class="btn" onclick="closeModal()">OK</button><button class="btn secondary" onclick="openPlanPrefs()">Preferences</button></div>`);
  } else toast(`${added} empty meal${added === 1 ? '' : 's'} filled${budgetLine}`);
}
