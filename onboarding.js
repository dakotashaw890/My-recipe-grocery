// First-run setup: who's eating, how you like to plan and shop, family sharing, and a short guide to the app.
// Runs after "Start with example recipes / an empty recipe box". Can be reopened from Settings.
const TOUR_KEY = () => KEY + '-tour';
let tour = null;   // {step, people:[...], prefs:{...}, pantryMode}
const TOUR_STEPS = ['people', 'plan', 'family', 'guide'];

function startOnboarding(only) {
  const p = typeof planPrefs === 'function' ? planPrefs() : {};
  tour = {
    step: only === 'guide' ? 3 : 0, only,
    people: (typeof peopleList === 'function' ? peopleList() : []).map(x => ({ ...x, wontEat: [...(x.wontEat || [])] })),
    prefs: { weekdayMax: p.weekdayMax ?? null, weekendMax: p.weekendMax ?? null, weeklyBudget: p.weeklyBudget ?? null },
    pantryMode: state.pantryMode || 'simple',
  };
  if (!tour.people.length) tour.people.push({ id: newPersonId(), name: (typeof syncInfo !== 'undefined' && syncInfo?.displayName) || '', emoji: '🧑', wontEat: [] });
  renderTour();
}
function tourDots() {
  if (tour.only === 'guide') return '';
  return `<div class="tour-dots" aria-label="Step ${tour.step + 1} of ${TOUR_STEPS.length}">${TOUR_STEPS.map((_, i) => `<span class="${i === tour.step ? 'on' : i < tour.step ? 'done' : ''}"></span>`).join('')}</div>`;
}
function tourNav(nextLabel = 'Next', canBack = true) {
  return `<div class="tour-nav">${canBack && tour.step > 0 && tour.only !== 'guide' ? '<button class="btn secondary" onclick="tourBack()">‹ Back</button>' : '<span></span>'}<button class="btn" onclick="tourNext()">${nextLabel}</button></div>
    ${tour.only === 'guide' ? '' : '<button class="linkbtn tour-skip" onclick="finishTour(true)">Skip setup</button>'}`;
}
function renderTour() {
  const step = TOUR_STEPS[tour.step];
  let body = '';
  if (step === 'people') {
    body = `<div class="tour-icon" aria-hidden="true">👪</div><h2>Who's eating?</h2>
      <p class="small muted">Add everyone at your table. Each person can rate recipes, and Whole Kitchen steers around foods someone won't eat.</p>
      <div id="tourPeople">${tour.people.map((p, i) => `<div class="tour-person">
        <select aria-label="Picture" class="emoji-select" onchange="tour.people[${i}].emoji=this.value">${PERSON_EMOJI.map(e => `<option ${e === p.emoji ? 'selected' : ''}>${e}</option>`).join('')}</select>
        <div class="grow"><input aria-label="Name" placeholder="Name" maxlength="24" value="${esc(p.name)}" oninput="tour.people[${i}].name=this.value">
        <input class="tour-wont" aria-label="Won't eat" placeholder="Won't eat (optional): mushrooms, peanuts…" value="${esc((p.wontEat || []).join(', '))}" oninput="tour.people[${i}].wontEat=this.value.split(',').map(x=>x.trim()).filter(Boolean)"></div>
        ${tour.people.length > 1 ? `<button class="iconbtn" aria-label="Remove" onclick="tour.people.splice(${i},1);renderTour()">✕</button>` : ''}</div>`).join('')}</div>
      <button class="btn ghost" onclick="tour.people.push({id:newPersonId(),name:'',emoji:PERSON_EMOJI[tour.people.length%PERSON_EMOJI.length],wontEat:[]});renderTour();setTimeout(()=>[...document.querySelectorAll('#tourPeople input[aria-label=Name]')].pop()?.focus(),30)">＋ Add someone</button>`;
  } else if (step === 'plan') {
    const opt = (v, cur) => `<option value="${v ?? ''}" ${v === cur ? 'selected' : ''}>${v ? 'Up to ' + formatMinutes(v) : 'No limit'}</option>`;
    const times = [null, 20, 30, 45, 60, 90];
    body = `<div class="tour-icon" aria-hidden="true">📅</div><h2>How do you like to cook and shop?</h2>
      <p class="small muted">Used when Whole Kitchen suggests meals for your week. Change any of it later in Plan → Preferences.</p>
      <div class="formrow"><div><label for="tourWeekday">Weeknight dinners</label><select id="tourWeekday" onchange="tour.prefs.weekdayMax=Number(this.value)||null">${times.map(v => opt(v, tour.prefs.weekdayMax)).join('')}</select></div>
      <div><label for="tourWeekend">Weekends</label><select id="tourWeekend" onchange="tour.prefs.weekendMax=Number(this.value)||null">${times.map(v => opt(v, tour.prefs.weekendMax)).join('')}</select></div></div>
      <label for="tourBudget">Weekly grocery budget <span class="muted">(optional)</span></label><input id="tourBudget" type="number" min="0" step="5" inputmode="decimal" placeholder="No budget" value="${esc(tour.prefs.weeklyBudget ?? '')}" oninput="tour.prefs.weeklyBudget=Number(this.value)>0?Number(this.value):null">
      <h3 style="margin-top:16px">Your pantry</h3>
      <label class="tour-choice ${tour.pantryMode === 'simple' ? 'on' : ''}"><input type="radio" name="tourPantry" ${tour.pantryMode === 'simple' ? 'checked' : ''} onchange="tour.pantryMode='simple';renderTour()"><span><b>Keep it simple</b><small>The list shows what recipes need. Seasonings and staples wait under “Check you have”; tap “I'm out” when you run low.</small></span></label>
      <label class="tour-choice ${tour.pantryMode === 'track' ? 'on' : ''}"><input type="radio" name="tourPantry" ${tour.pantryMode === 'track' ? 'checked' : ''} onchange="tour.pantryMode='track';renderTour()"><span><b>Track what I have</b><small>Keep pantry amounts (scan barcodes, finished trips fill it in), and the list only shows what you're short.</small></span></label>`;
  } else if (step === 'family') {
    const shared = typeof syncActive === 'function' && syncActive();
    body = `<div class="tour-icon" aria-hidden="true">🤝</div><h2>Share with your family</h2>
      ${shared ? `<p>✓ This phone is sharing with <b>${esc(syncInfo.familyName || 'your family')}</b>. Recipes, the plan and the shopping list stay in sync on every phone.</p><p class="small muted">To add someone, share the join code from Settings → Family sync.</p>`
        : `<p class="small">With a free account, everyone's phone shows the same recipes, meal plan and shopping list, and the list updates live while you shop.</p>
      <ul class="small app-list"><li>Create the family on one phone, then share its join code.</li><li>Others tap <b>Join my family's kitchen</b> and enter the code.</li><li>You can do this any time in Settings.</li></ul>
      <div class="actions"><button class="btn secondary" onclick="finishTour(false,'family')">Set up sharing now</button>${typeof googleSignIn === 'function' && typeof syncConfigured !== 'undefined' && syncConfigured ? '<button class="btn secondary" onclick="finishTour(false,\'google\')">Continue with Google</button>' : ''}</div>`}`;
  } else {
    const items = [
      ['📖', 'Recipes', 'Add your own, tap 🔗 Import for websites, or snap a recipe card (handwriting too). From TikTok or Instagram, tap Share → Whole Kitchen.'],
      ['📅', 'Plan', 'Tap a day to add a meal, or ✨ Suggest empty meals to fill the week using your preferences.'],
      ['🛒', 'Shop', 'The list builds itself from your plan. Check things off, ＋ Add extras, and ⇄ Swap when the store is out.'],
      ['🧂', 'Check you have', 'Seasonings and staples wait in a folded section. Tap “I\'m out” there, or “Out?” while cooking, to put them on the list.'],
      ['🍳', 'Cook', 'Open a recipe and tap Cook for big step-by-step text and timers. The screen stays on.'],
      ['⭐', 'Ratings', 'After a meal, each person rates it. Favorites come up more often when Whole Kitchen suggests meals.'],
      ['⚙️', 'Settings', 'Family sharing, backups, setup check and this guide (App guide) live here.'],
    ];
    body = `<div class="tour-icon" aria-hidden="true">🧭</div><h2>${tour.only === 'guide' ? 'How Whole Kitchen works' : 'You\'re all set. Here\'s the quick tour'}</h2>
      <div class="tour-guide">${items.map(([e, t, d]) => `<div class="tour-item"><span class="tour-emoji" aria-hidden="true">${e}</span><div><b>${t}</b><p>${d}</p></div></div>`).join('')}</div>`;
  }
  openModal(`<div class="tour">${tourDots()}${body}${tourNav(step === 'guide' ? (tour.only === 'guide' ? 'Got it' : 'Let\'s cook!') : step === 'family' && !(typeof syncActive === 'function' && syncActive()) ? 'Maybe later' : 'Next')}</div>`);
}
function saveTourStep() {
  const step = TOUR_STEPS[tour.step];
  if (step === 'people') {
    const list = tour.people.filter(p => String(p.name || '').trim());
    state.people ??= {};
    const keep = new Set(list.map(p => p.id));
    for (const id of Object.keys(state.people)) if (!keep.has(id)) delete state.people[id];
    list.forEach((p, n) => { state.people[p.id] = { id: p.id, name: p.name.trim(), emoji: p.emoji || '🙂', wontEat: p.wontEat || [], order: n + 1 } });
    save();
  } else if (step === 'plan') {
    state.planPrefs = { ...(state.planPrefs || {}), weekdayMax: tour.prefs.weekdayMax, weekendMax: tour.prefs.weekendMax, weeklyBudget: tour.prefs.weeklyBudget };
    state.pantryMode = tour.pantryMode;
    save();
  }
}
function tourNext() { saveTourStep(); if (tour.step >= TOUR_STEPS.length - 1) return finishTour(false); tour.step++; renderTour() }
function tourBack() { saveTourStep(); tour.step = Math.max(0, tour.step - 1); renderTour() }
function finishTour(skipped, then) {
  if (!skipped) saveTourStep();
  try { localStorage.setItem(TOUR_KEY(), 'done') } catch (_) {}
  const only = tour?.only; tour = null; closeModal(); renderTourCard();
  if (then === 'google') return googleSignIn('settings');
  if (then === 'family') { showScreen('settings'); setTimeout(() => document.getElementById('familyCard')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 200); return }
  if (!only) { if (!skipped) showScreen('home'); toast(skipped ? 'You can finish setup any time in Settings → Help' : 'Welcome to Whole Kitchen!') }
}
// Home: offer the tour once to people who started before it existed
function renderTourCard() {
  let card = document.getElementById('tourCard');
  let seen = 'done'; try { seen = localStorage.getItem(TOUR_KEY()) } catch (_) {}
  if (seen || state.welcome || !Object.keys(state.data?.recipes || {}).length) { card?.remove(); return }
  if (!card) { const anchor = document.getElementById('backupReminder'); if (!anchor) return; card = document.createElement('div'); card.id = 'tourCard'; anchor.parentNode.insertBefore(card, anchor) }
  card.innerHTML = `<div class="card tour-card"><div><b>👋 New here, or new features?</b><div class="small muted">A one-minute setup: your family, how you like to plan, and a quick guide.</div></div>
    <div class="actions"><button class="btn" onclick="startOnboarding()">Start</button><button class="btn secondary" onclick="try{localStorage.setItem(TOUR_KEY(),'dismissed')}catch(_){}renderTourCard()">No thanks</button></div></div>`;
}
// Settings: reopen
function renderGuideCard() {
  const host = document.getElementById('settings'); if (!host) return;
  let card = document.getElementById('guideCard');
  if (!card) { card = document.createElement('div'); card.id = 'guideCard'; card.className = 'card'; const before = document.getElementById('accountCard'); before ? host.insertBefore(card, before) : host.appendChild(card) }
  card.innerHTML = `<h3>🧭 Help</h3><p class="small muted">A quick guide to every part of Whole Kitchen, or redo the setup questions.</p>
    <div class="actions"><button class="btn secondary" onclick="startOnboarding('guide')">App guide</button><button class="btn secondary" onclick="startOnboarding()">Redo setup</button></div>`;
}
