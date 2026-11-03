// Prep reminders (v38): things to do ahead for planned meals, like thawing meat, marinating, soaking beans, or
// starting the slow cooker. Shown on Home ("Prep ahead") on every phone; and, for phones that turn notifications on,
// sent as a phone notification at the right time by the family's Supabase helper.
// Settings (shared by the family): state.planPrefs.reminders = {on, thaw, advance, slow, start, times:{Breakfast:'07:30',…}}
// Done marks: state.plan[key].prepDone = ['thaw', …] (so the whole family sees it's handled).
'use strict';

const REMIND_DEFAULTS = { on: false, thaw: true, advance: true, slow: true, start: false, times: { Breakfast: '07:30', Lunch: '12:00', Dinner: '18:00' } };
function remindPrefs() { const p = state.planPrefs?.reminders || {}; return { ...REMIND_DEFAULTS, ...p, times: { ...REMIND_DEFAULTS.times, ...(p.times || {}) } } }
function setRemindPrefs(change) { state.planPrefs = { ...(state.planPrefs || {}), reminders: { ...remindPrefs(), ...change } }; save() }

// ---------- working out what needs doing ahead ----------
const MEAT_RE = /\b(chicken|beef|steaks?|pork|turkey|lamb|veal|venison|bison|sausages?|brats?|bratwurst|meatballs|chops?|tenderloin|brisket|roast|ribs|short ribs|shrimp|prawns|salmon|tilapia|cod|fish|scallops|crab|lobster|halibut|mahi|duck|ham|wings|drumsticks|thighs)\b/i;
const NOT_THAW_RE = /\b(broth|stock|bouillon|base|canned|cooked|rotisserie|deli|lunch ?meat|jerky|bits|pepperoni|salami|seasoning|gravy|soup|sauce|powder|flavou?red|ramen|imitation|paste|fat|grease|drippings|gelatin|tuna)\b/i;
const ADVANCE_RE = /\b(marinat\w*|soak\w*|brin(?:e|ing)|chill\w*|refrigerat\w*|rise|proof\w*|let (?:it |them |the dough )?(?:sit|stand|rest)|freez\w*|set)\b([^.;!]*?)\b(overnight|the night before|a day ahead|(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:hours?|hrs?)\b)/i;
const SLOW_RE = /\b(slow[- ]cooker|crock[- ]?pot|crockpot)\b/i;
const SLOW_TIME_RE = /\b(low|high)\b[^.;!]*?(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:hours?|hrs?)\b|(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:hours?|hrs?)\b[^.;!]*?\bon (low|high)\b/i;

function atTime(iso, hhmm) { const [h, m] = String(hhmm || '18:00').split(':').map(Number), d = dateOf(iso); d.setHours(h || 0, m || 0, 0, 0); return d }
function clock(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
function whenWords(d) {
  const today = todayISO(), day = isoDate(d);
  const part = d.getHours() >= 17 ? 'tonight' : d.getHours() < 12 ? 'this morning' : 'this afternoon';
  return day === today ? `${part[0].toUpperCase() + part.slice(1)} ${clock(d)}` : day === addDays(today, 1) ? `Tomorrow ${clock(d)}` : `${dateOf(day).toLocaleDateString([], { weekday: 'short' })} ${clock(d)}`;
}
function niceList(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] }
function thawItems(r) {
  return [...new Set((r.ingredients || []).filter(i => num(i.qty) > 0 && MEAT_RE.test(i.name) && !NOT_THAW_RE.test(i.name + ' ' + (i.note || ''))).map(i => i.name.toLowerCase()))];
}
function advanceSteps(r) {
  const out = [];
  for (const step of typeof recipeSteps === 'function' ? recipeSteps(r) : (r.directions || [])) {
    const m = String(step).match(ADVANCE_RE); if (!m) continue;
    const overnight = /overnight|night before|day ahead/i.test(m[3]);
    const hours = overnight ? 10 : Number(m[5] || m[4]);
    if (!overnight && !(hours >= 2)) continue;      // "rest 10 minutes" is part of cooking, not prep
    const verb = m[1].toLowerCase().replace(/^marinat\w*/, 'marinate').replace(/^soak\w*/, 'soak').replace(/^chill\w*/, 'chill').replace(/^refrigerat\w*/, 'refrigerate').replace(/^proof\w*/, 'let it rise').replace(/^freez\w*/, 'freeze').replace(/^brin\w*/, 'brine');
    out.push({ verb, hours, overnight, what: m[0].trim(), step: String(step) });
  }
  return out;
}
function slowCooker(r) {
  const steps = typeof recipeSteps === 'function' ? recipeSteps(r) : (r.directions || []);
  for (const step of steps) {
    if (!SLOW_RE.test(step) && !SLOW_RE.test(r.name || '')) continue;
    const m = String(step).match(SLOW_TIME_RE); if (!m) continue;
    const setting = (m[1] || m[7] || 'low').toLowerCase(), hours = Math.max(Number(m[2] || m[5]) || 0, Number(m[3] || m[6]) || 0);
    if (hours >= 1.5) return { setting, hours };
  }
  return null;
}
// every reminder for planned meals from today through `days` days ahead
function computeReminders(days = 8, opts = {}) {
  const p = remindPrefs(), now = opts.now || new Date(), from = todayISO(), to = addDays(from, days), out = [];
  for (const [key, v] of Object.entries(state.plan || {})) {
    if (!isDateKey(key) || !v?.recipe || v.cooked) continue;
    const date = planDateOf(key), meal = planMealOf(key), r = state.data.recipes[v.recipe];
    if (!r || date < from || date > to) continue;
    const mealAt = atTime(date, p.times[meal] || '18:00'), total = (Number(r.prepMinutes) || 0) + (Number(r.cookMinutes) || 0) || 45;
    const startAt = new Date(mealAt - total * 60000), done = new Set(v.prepDone || []);
    const add = (kind, at, title, body) => { if (!done.has(kind)) out.push({ key: key + '|' + kind, planKey: key, kind, at, title, body, rid: v.recipe, meal, date }) };
    const mealWord = meal.toLowerCase(), eat = `${meal === 'Dinner' ? 'dinner' : mealWord} at ${clock(mealAt)}`;
    if (p.thaw) {
      const items = thawItems(r);
      if (items.length) {
        const at = atTime(addDays(date, -1), '19:00');
        add('thaw', at, `Thaw for ${date === addDays(isoDate(at), 1) ? 'tomorrow' : 'later'}: ${r.name}`, `If the ${niceList(items)} ${items.length > 1 || /s$/.test(items[0]) ? 'are' : 'is'} frozen, move ${items.length > 1 || /s$/.test(items[0]) ? 'them' : 'it'} to the fridge tonight for ${dayNameOf(date)}'s ${mealWord}.`);
      }
    }
    const slow = p.slow ? slowCooker(r) : null;
    if (slow) {
      const at = new Date(mealAt - (slow.hours * 60 + (Number(r.prepMinutes) || 15)) * 60000);
      add('slow', at, `Start the slow cooker: ${r.name}`, `Cook on ${slow.setting} for ${fmt(slow.hours)} hours to eat ${eat}.`);
    }
    if (p.advance) for (const [n, a] of advanceSteps(r).entries()) {
      let at = a.overnight ? atTime(addDays(date, -1), '20:00') : new Date(startAt - a.hours * 3600000);
      if (!a.overnight && at.getHours() < 7) { at = atTime(addDays(isoDate(at), -1), '21:00') }   // not at 5 AM: the night before instead
      const len = a.overnight ? 'overnight' : `${fmt(a.hours)} hours`;
      add('advance' + (n || ''), at, `Prep ahead: ${r.name}`, `${a.verb[0].toUpperCase() + a.verb.slice(1)} ${len} before cooking (for ${eat}). “${a.step.length > 120 ? a.step.slice(0, 117) + '…' : a.step}”`);
    }
    if (p.start && !slow) add('start', startAt, `Time to start ${mealWord}: ${r.name}`, `About ${total} minutes, ready for ${eat}.`);
  }
  return out.filter(x => x.at > new Date(now - 3 * 3600000)).sort((a, b) => a.at - b.at);
}

// ---------- Home: "Prep ahead" ----------
function renderPrepCard() {
  const box = document.getElementById('homePrep'); if (!box) return;
  const now = Date.now(), endTomorrow = atTime(addDays(todayISO(), 1), '23:59');
  const list = computeReminders(2).filter(x => x.at <= endTomorrow && x.kind !== 'start').slice(0, 4);
  if (!list.length) { box.innerHTML = ''; return }
  const p = remindPrefs();
  box.innerHTML = `<div class="card prep-card"><div class="row between"><h3 class="h-ico"><span class="set-ico t-butter"><svg class="ico" aria-hidden="true"><use href="#i-bell"/></svg></span>Prep ahead</h3>${!p.on ? '<button class="linkish small" onclick="openSettingsPage(\'reminders\')">Get reminders</button>' : ''}</div>
    ${list.map(x => `<div class="prep-item ${x.at <= now ? 'due' : ''}"><div class="grow"><small>${x.at <= now ? 'Now' : esc(whenWords(x.at))} · ${{ thaw: 'Thaw', slow: 'Slow cooker', start: 'Start cooking' }[x.kind] || 'Prep ahead'}</small><b>${esc(x.title.replace(/^[^:]+: /, ''))}</b><span class="small">${esc(x.body.replace(/ “.*$/, ''))}</span></div>
      <button class="btn secondary prep-done" aria-label="Done: ${esc(x.title)}" onclick="markPrepDone(decodeURIComponent('${encId(x.planKey)}'),'${x.kind}')">✓ Done</button></div>`).join('')}</div>`;
}
function markPrepDone(planKey, kind) {
  const v = state.plan[planKey]; if (!v) return;
  state.plan[planKey] = { ...v, prepDone: [...new Set([...(v.prepDone || []), kind])] };
  save(); renderPrepCard(); toast('Done ✓');
}

// ---------- sending the family's list to Supabase (only when reminders are on) ----------
let remindTimer = null, remindBusy = false;
function remindersStateSaved() { clearTimeout(remindTimer); remindTimer = setTimeout(syncReminders, 3000) }
async function remindRpc(fn, args) {
  const r = await fetch(SYNC_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await readJSON(r);
  if (!r.ok) throw Object.assign(new Error(j?.message || 'Supabase said ' + r.status), { status: r.status, missing: r.status === 404 || /function .* does not exist|PGRST202/i.test((j?.message || '') + (j?.code || '')) });
  return j;
}
function canSyncReminders() { return typeof syncActive === 'function' && syncActive() && !!syncInfo?.familyId }
async function syncReminders(force) {
  if (remindBusy || !canSyncReminders() || !remindPrefs().on) return;
  const items = computeReminders(8).filter(x => x.at > new Date()).slice(0, 150).map(x => ({ key: x.key, at: x.at.toISOString(), title: x.title.slice(0, 120), body: x.body.slice(0, 300) }));
  const sig = (typeof hashText === 'function' ? hashText : JSON.stringify)(JSON.stringify(items));
  let last = ''; try { last = localStorage.getItem(KEY + '-remindSig') || '' } catch (_) {}
  if (!force && String(sig) === last) return;
  remindBusy = true;
  try { await remindRpc('rg_set_reminders', { p_family: syncInfo.familyId, p_items: items }); try { localStorage.setItem(KEY + '-remindSig', String(sig)) } catch (_) {} }
  catch (e) { console.warn('Reminders not sent to Supabase:', e.message) }
  finally { remindBusy = false }
}

// ---------- Settings: turning notifications on for this phone ----------
// This phone's notification address (asks the helper for the server's key the first time). Used by reminders and timers.
async function ensurePushSub() {
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  const { publicKey } = await callHelper({ action: 'push-key' });
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((publicKey.length + 3) % 4)), c => c.charCodeAt(0));
  if (sub && btoa(String.fromCharCode(...new Uint8Array(sub.options?.applicationServerKey || []))) !== btoa(String.fromCharCode(...key))) { await sub.unsubscribe(); sub = null }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sub.toJSON();
}
async function pushSubscription() { try { const reg = await navigator.serviceWorker?.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null } catch (_) { return null } }
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window }
async function renderRemindersCard() {
  const box = document.getElementById('remindersCard'); if (!box) return;
  const p = remindPrefs(), sub = await pushSubscription(), here = !!sub && Notification.permission === 'granted';
  const upcoming = computeReminders(8).filter(x => x.at > new Date());
  const next = upcoming[0];
  const opt = (k, label, hint) => `<label class="check-row"><input type="checkbox" ${p[k] ? 'checked' : ''} onchange="setRemindPrefs({${k}:this.checked});renderRemindersCard();renderPrepCard?.()"> <span>${label}${hint ? `<small class="muted"> ${hint}</small>` : ''}</span></label>`;
  const status = !pushSupported() ? '<p class="small muted">This browser can\'t show notifications. Reminders still show on the Home screen.</p>'
    : !canSyncReminders() ? '<p class="small muted">Phone notifications need family sharing (Settings → Family sharing). Reminders already show on the Home screen.</p>'
    : here ? `<p class="small ing-ok">✓ This phone gets reminders${p.on ? '' : ' (paused for the family)'}.</p>` : Notification.permission === 'denied' ? '<p class="small warning">Notifications are blocked for Whole Kitchen. Turn them on in your phone\'s settings (Apps → Whole Kitchen → Notifications), then try again.</p>' : '';
  box.innerHTML = `<h3>⏰ Prep reminders</h3>
    <p class="muted small">A heads-up for planned meals: thaw the chicken the night before, start the slow cooker, marinate or soak ahead. They show on Home, and can pop up as phone notifications.</p>
    ${status}
    <div class="actions">${pushSupported() && canSyncReminders() ? (here ? '<button class="btn secondary" onclick="sendTestReminder()">Send a test</button><button class="btn ghost" onclick="turnOffReminders()">Turn off on this phone</button>' : '<button class="btn" onclick="turnOnReminders()">🔔 Get reminders on this phone</button>') : ''}</div>
    <div id="remindMsg" class="small" role="status"></div>
    <details class="remind-more"><summary class="small">What to remind about</summary>
      ${opt('thaw', 'Thaw meat', 'the evening before (skip if you buy it fresh)')}
      ${opt('advance', 'Marinate, soak, chill or rise ahead', 'when a step says hours or overnight')}
      ${opt('slow', 'Start the slow cooker')}
      ${opt('start', 'Time to start cooking', 'for every planned meal')}
      <div class="remind-times">${MEALS.map(m => `<label>${m}<input type="time" value="${p.times[m]}" onchange="setRemindPrefs({times:{...remindPrefs().times,'${m}':this.value||'${REMIND_DEFAULTS.times[m]}'}});renderRemindersCard()"></label>`).join('')}</div>
      <p class="tiny muted">Meal times are used to work out when to remind. These settings are shared with your family.</p>
    </details>
    <p class="tiny muted">${upcoming.length ? `Next: ${esc(whenWords(next.at))}: ${esc(next.title)}. ${upcoming.length} coming up this week.` : 'Nothing needs doing ahead for the meals planned this week.'}</p>`;
}
async function turnOnReminders() {
  const msg = t => { const el = document.getElementById('remindMsg'); if (el) { el.className = 'small'; el.textContent = t } }, warn = t => { const el = document.getElementById('remindMsg'); if (el) { el.className = 'small warning'; el.textContent = t } };
  try {
    msg('Asking to show notifications…');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return warn('Notifications weren\'t allowed. You can allow them in your phone\'s settings for Whole Kitchen.');
    msg('Setting up…');
    const j = await ensurePushSub();
    await remindRpc('rg_push_subscribe', { p_family: syncInfo.familyId, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    await callHelper({ action: 'push-setup' });
    setRemindPrefs({ on: true });
    await syncReminders(true);
    await renderRemindersCard();
    msg('✓ Reminders are on. Sending a test…');
    await sendTestReminder();
  } catch (e) {
    warn(e.missing ? 'Reminders aren\'t set up in Supabase yet: run launch-setup.sql in the SQL Editor.' : e.signin ? 'Sign in under Settings → Family sharing first.' : /web address|Unknown reminder/i.test(e.message) ? 'Your Supabase helper is an older version: paste the newest recipe-import.ts into recipe-imports and Deploy.' : e.message);
  }
}
async function sendTestReminder() {
  const el = document.getElementById('remindMsg'), sub = await pushSubscription();
  if (!sub) return;
  try { await callHelper({ action: 'push-test', subscription: sub.toJSON() }); if (el) { el.className = 'small ing-ok'; el.textContent = '✓ Test sent. It should pop up in a few seconds.' } }
  catch (e) { if (el) { el.className = 'small warning'; el.textContent = e.message } }
}
async function turnOffReminders() {
  const sub = await pushSubscription();
  try { if (sub) { await remindRpc('rg_push_unsubscribe', { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe() } } catch (_) {}
  toast('Reminders off on this phone'); renderRemindersCard();
}
// first load: catch up (the plan may have changed on another phone)
setTimeout(() => { try { syncReminders() } catch (_) {} }, 4000);
// tapping a reminder notification while Whole Kitchen is open: show Home, where the prep card is
try { navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'reminder-open') showScreen('home') }) } catch (_) {}
