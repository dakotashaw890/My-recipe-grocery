// Cook mode extras (v22): tap-to-start timers found in the steps, and US ⇄ metric amounts and temperatures.
'use strict';

// ---------- Timers ----------
// "Bake 25-30 minutes", "simmer for 1 hour 15 minutes", "rest 10 mins", "1½ hours"
const DURATION_RE = /(?<![\w.])(\d+(?:\.\d+)?(?:\s*[½¼¾])?|[½¼¾]|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty[- ]five)(?:\s*(?:-|–|to|or)\s*\d+(?:\.\d+)?)?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b(?:\s*(?:and\s*)?(\d+)\s*(minutes?|mins?))?/gi;
const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45, 'forty five': 45 };
function stepTimers(text) {
  const out = [];
  for (const m of String(text || '').matchAll(DURATION_RE)) {
    let n = m[1].toLowerCase();
    const frac = { '½': .5, '¼': .25, '¾': .75 };
    let v = WORD_NUM[n] ?? (n.replace(/[½¼¾]/g, '').trim() ? parseFloat(n) : 0) + ([...n].map(c => frac[c] || 0).reduce((a, b) => a + b, 0));
    if (!(v > 0)) continue;
    const u = m[2].toLowerCase();
    let secs = /^h/.test(u) ? v * 3600 : /^s/.test(u) ? v : v * 60;
    if (m[3]) secs += Number(m[3]) * 60;
    if (secs < 30 || secs > 24 * 3600) continue;
    out.push({ secs: Math.round(secs), label: m[0].trim() });
  }
  return out;
}
// v44: timers are kept on the phone (so closing the app doesn't lose them), and on a signed-in phone the end time is
// also sent to Supabase, which sends the "Time's up" notification even while the phone sleeps or the app is closed.
let cookTimers = [];   // {id, label, end, secs, done, phone}
let timerTick = null;
const timerKey = () => KEY + '-timers';   // KEY comes from core.js, which loads after this file
function saveTimers() { try { localStorage.setItem(timerKey(), JSON.stringify(cookTimers.map(({ id, label, end, secs, done, phone }) => ({ id, label, end, secs, done, phone })))) } catch (_) {} }
function restoreTimers() {
  let saved = []; try { saved = JSON.parse(localStorage.getItem(timerKey()) || '[]') } catch (_) {}
  const now = Date.now();
  // a timer that ended more than 10 minutes ago has had its notification; let it go
  cookTimers = (Array.isArray(saved) ? saved : []).filter(t => t && t.end > now - 10 * 60000);
  for (const t of cookTimers) if (!t.done && t.end <= now) t.done = true;   // ended while the app was closed: show it, no beeping
  if (cookTimers.length) { ensureTimerTick(); renderTimers() }
  saveTimers();
  // a Stop or +1 min tapped on the notification while the app was closed
  const q = new URLSearchParams(location.search), act = q.get('timerAction'), tid = q.get('timer');
  if (act && tid) { timerAction(act, tid); q.delete('timerAction'); q.delete('timer'); try { history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash) } catch (_) {} }
  for (const t of cookTimers) if (!t.done) timerNotice(t);
}
function phoneTimersPossible() { return typeof syncConfigured !== 'undefined' && syncConfigured && typeof syncAuth !== 'undefined' && !!syncAuth && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window }
async function sendTimerToServer(t) {
  if (!phoneTimersPossible() || Notification.permission !== 'granted') return false;
  try {
    await loadScriptOnce('reminders.js?v=45');
    const sub = await ensurePushSub(); if (!sub) return false;
    await remindRpc('rg_timer_set', { p_id: String(t.id), p_due: new Date(t.end).toISOString(), p_label: String(t.label || '').slice(0, 120), p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth });
    let ready = ''; try { ready = localStorage.getItem(KEY + '-timerSchedule') || '' } catch (_) {}
    if (!ready) { await callHelper({ action: 'push-setup', timers: true }); try { localStorage.setItem(KEY + '-timerSchedule', '1') } catch (_) {} }
    return true;
  } catch (e) { console.warn('Timer stays on this phone only:', e.message); return false }
}
// v45: while a timer runs, a quiet notification stays on the phone ("Simmer · ends at 5:32 PM") with Stop and +1 min.
// When the timer ends it turns into the "Time's up" alert (same tag), from this phone or from Supabase.
function endsAt(t) { return new Date(t.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
async function timerNotice(t) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || t.done) return;
    const reg = await navigator.serviceWorker?.getRegistration(); if (!reg) return;
    await reg.showNotification('⏱ ' + (t.label || 'Cooking timer'), { body: `Ends at ${endsAt(t)}${t.phone ? '' : ' · keep Whole Kitchen open to hear it'}`, tag: 'timer-' + t.id, silent: true, renotify: false, requireInteraction: true, timestamp: t.end, icon: 'icon-192.png', badge: 'badge-96.png', data: { url: './index.html', timer: String(t.id) }, actions: [{ action: 'timer-stop', title: 'Stop' }, { action: 'timer-add', title: '+1 min' }] });
  } catch (_) {}
}
async function closeTimerNotice(id) {
  try { const reg = await navigator.serviceWorker?.getRegistration(); (await reg?.getNotifications({ tag: 'timer-' + id }) || []).forEach(n => n.close()) } catch (_) {}
}
function timerAction(action, id) {
  const t = cookTimers.find(x => String(x.id) === String(id)); if (!t) { closeTimerNotice(id); return }
  if (action === 'timer-stop') stopTimer(t.id); else if (action === 'timer-add') addTimerMinute(t.id);
}
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'timer-action') timerAction(e.data.action, e.data.id) });
async function startTimer(secs, label) {
  const t = { id: Date.now() + Math.floor(Math.random() * 1000) / 1000, label, secs, end: Date.now() + secs * 1000, done: false, phone: false };
  cookTimers.push(t); saveTimers();
  ensureTimerTick(); renderTimers();
  if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission() } catch (_) {} }
  t.phone = await sendTimerToServer(t); saveTimers(); renderTimers(true); timerNotice(t);
  toast(t.phone ? `Timer started: ${formatTimer(secs)}. It will ring even if your phone sleeps.` : `Timer started: ${formatTimer(secs)}`);
}
function stopTimer(id) {
  const t = cookTimers.find(x => x.id === id);
  cookTimers = cookTimers.filter(x => x.id !== id); saveTimers(); stopAlarmIfQuiet(); renderTimers(); closeTimerNotice(id);
  if (t?.phone && !t.done && typeof remindRpc === 'function') remindRpc('rg_timer_cancel', { p_id: String(t.id) }).catch(() => {});
}
async function addTimerMinute(id) {
  const t = cookTimers.find(x => x.id === id); if (!t) return;
  t.end = Math.max(Date.now(), t.end) + 60000; t.done = false; saveTimers(); stopAlarmIfQuiet(); ensureTimerTick(); renderTimers();
  if (t.phone || phoneTimersPossible()) { t.phone = await sendTimerToServer(t); saveTimers(); renderTimers(true) }
  timerNotice(t);
}
function formatTimer(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}` }
function ensureTimerTick() { if (!timerTick) timerTick = setInterval(timerStep, 500) }
function timerStep() {
  if (!cookTimers.length) { clearInterval(timerTick); timerTick = null; renderTimers(); return }
  for (const t of cookTimers) if (!t.done && Date.now() >= t.end) { t.done = true; saveTimers(); timerDone(t) }
  renderTimers();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cookTimers.length) timerStep() });
let alarmCtx = null, alarmLoop = null;
function timerDone(t) {
  try { navigator.vibrate?.([400, 200, 400, 200, 400]) } catch (_) {}
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible')
      navigator.serviceWorker?.getRegistration().then(reg => reg?.showNotification('⏱ Time\'s up', { body: t.label, tag: 'timer-' + t.id, renotify: true, requireInteraction: true, vibrate: [400, 200, 400], icon: 'icon-192.png', badge: 'badge-96.png', data: { url: './index.html', timer: String(t.id) }, actions: [{ action: 'timer-stop', title: 'Stop' }] }));
    else closeTimerNotice(t.id);   // on screen: the app is beeping, the "ends at" note can go
  } catch (_) {}
  if (!alarmLoop) { beep(); alarmLoop = setInterval(beep, 1600) }
}
function beep() {
  try {
    alarmCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const now = alarmCtx.currentTime;
    [0, .25, .5].forEach(d => {
      const o = alarmCtx.createOscillator(), g = alarmCtx.createGain();
      o.frequency.value = 880; o.type = 'sine'; o.connect(g); g.connect(alarmCtx.destination);
      g.gain.setValueAtTime(0.0001, now + d); g.gain.exponentialRampToValueAtTime(0.35, now + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.18);
      o.start(now + d); o.stop(now + d + 0.2);
    });
  } catch (_) {}
}
function stopAlarmIfQuiet() { if (!cookTimers.some(t => t.done) && alarmLoop) { clearInterval(alarmLoop); alarmLoop = null } }
function timersHTML() {
  if (!cookTimers.length) return '';
  return cookTimers.map(t => { const left = (t.end - Date.now()) / 1000; return `<div class="timer-chip ${t.done ? 'ringing' : ''}" role="timer" data-timer="${t.id}">
    <span class="timer-label">${t.phone ? '<svg class="ico timer-phone" role="img" aria-label="Rings even if the phone sleeps"><title>Rings even if the phone sleeps</title><use href="#i-bell"/></svg>' : ''}${esc(t.label)}</span><b>${t.done ? 'Time\'s up!' : formatTimer(left)}</b>
    <button type="button" aria-label="Add a minute" onclick="addTimerMinute(${t.id})">+1</button><button type="button" aria-label="${t.done ? 'Stop alarm' : 'Cancel timer'}" onclick="stopTimer(${t.id})">${t.done ? 'Stop' : '✕'}</button></div>` }).join('');
}
// timers show inside cook mode, and in a small dock everywhere else so they're never lost
// Only the numbers change each tick; the buttons are rebuilt only when a timer starts, ends or is removed,
// so a tap on Stop or +1 never lands on a button that's being replaced.
function renderTimers() {
  const sig = cookTimers.map(t => t.id + (t.done ? 'd' : '') + (t.phone ? 'p' : '')).join(',');
  const paint = host => {
    if (!host) return;
    if (host.dataset.sig !== sig) { host.innerHTML = timersHTML(); host.dataset.sig = sig; return }
    for (const t of cookTimers) { const b = host.querySelector(`[data-timer="${t.id}"] b`); if (b && !t.done) b.textContent = formatTimer((t.end - Date.now()) / 1000) }
  };
  paint(document.getElementById('cookTimers'));
  let dock = document.getElementById('timerDock');
  const showDock = cookTimers.length && !document.body.classList.contains('cooking');
  if (showDock && !dock) { dock = document.createElement('div'); dock.id = 'timerDock'; document.body.appendChild(dock) }
  if (dock) { dock.hidden = !showDock; if (showDock) paint(dock) }
}
function stepWithTimers(text, stepNo) {
  const timers = stepTimers(text);
  return timers.length ? `<div class="step-timers">${timers.map(t => `<button type="button" class="timer-start" onclick="startTimer(${t.secs},'Step ${stepNo} · ${esc(t.label).replace(/'/g, '&#39;')}')">⏱ Start timer · ${esc(t.label)}</button>`).join('')}</div>` : '';
}

// ---------- US ⇄ metric ----------
function unitSystem() { try { return localStorage.getItem('gingham-units') || 'us' } catch (_) { return 'us' } }
function toggleUnitSystem() { try { localStorage.setItem('gingham-units', unitSystem() === 'us' ? 'metric' : 'us') } catch (_) {} if (typeof renderCookMode === 'function') renderCookMode() }
const US_VOLUME = new Set(['tsp', 'tbsp', 'cup', 'fl oz', 'pint', 'quart', 'gallon']), US_MASS = new Set(['oz', 'lb']);
const METRIC_VOLUME = new Set(['ml', 'l']), METRIC_MASS = new Set(['g', 'kg']);
// returns {qty, unit} in the chosen system, or null to leave it as written
function amountIn(system, q, unit) {
  const u = unitName(unit);
  if (!(q > 0)) return null;
  if (system === 'metric') {
    if (US_VOLUME.has(u)) { if (u === 'tsp' || u === 'tbsp') return null;     // spoons are used everywhere
      const ml = q * VOLUME_ML[u]; return ml >= 1000 ? { qty: roundNice(ml / 1000, 2), unit: 'l' } : { qty: roundNice(ml, ml < 50 ? 0 : -1), unit: 'ml' } }
    if (US_MASS.has(u)) { const g = q * MASS_G[u]; return g >= 1000 ? { qty: roundNice(g / 1000, 2), unit: 'kg' } : { qty: roundNice(g, g < 50 ? 0 : -1), unit: 'g' } }
    return null;
  }
  if (METRIC_VOLUME.has(u)) {
    const ml = q * VOLUME_ML[u];
    if (ml < 15) return { qty: roundFraction(ml / VOLUME_ML.tsp), unit: 'tsp' };
    if (ml < 60) return { qty: roundFraction(ml / VOLUME_ML.tbsp), unit: 'tbsp' };
    return { qty: roundFraction(ml / VOLUME_ML.cup), unit: 'cup' };
  }
  if (METRIC_MASS.has(u)) { const g = q * MASS_G[u]; return g >= 454 ? { qty: roundFraction(g / MASS_G.lb, 4), unit: 'lb' } : { qty: roundFraction(g / MASS_G.oz, 2), unit: 'oz' } }
  return null;
}
function roundNice(v, digits) { const f = Math.pow(10, digits); return Math.round(v * f) / f }
function roundFraction(v, parts = 4) { const r = Math.round(v * parts) / parts; return r || Math.round(v * 8) / 8 || roundNice(v, 2) }
function convertTemps(text, system) {
  if (system === 'metric') return String(text).replace(/(\d{2,3})\s*(?:°|º|degrees?)\s*F(?:ahrenheit)?\b/gi, (m, f) => `${Math.round((f - 32) * 5 / 9 / 5) * 5}°C`);
  return String(text).replace(/(\d{2,3})\s*(?:°|º|degrees?)\s*C(?:elsius)?\b/gi, (m, c) => `${Math.round((c * 9 / 5 + 32) / 5) * 5}°F`);
}
function cookAmountHTML(i, scale) {
  const q = num(i.qty), sys = unitSystem();
  const conv = q !== null ? amountIn(sys, q * scale, i.unit) : null;
  return conv ? `${esc(fmt(conv.qty))} ${esc(conv.unit)}` : `${displayQty(i, scale)} ${esc(i.unit || '')}`;
}

window.addEventListener('load', () => { try { restoreTimers() } catch (e) { console.warn('Timers not restored', e) } });
