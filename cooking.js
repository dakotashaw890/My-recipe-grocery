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
let cookTimers = [];   // {id, label, end, secs, done}
let timerTick = null;
function startTimer(secs, label) {
  cookTimers.push({ id: Date.now() + Math.random(), label, secs, end: Date.now() + secs * 1000, done: false });
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  ensureTimerTick(); renderTimers();
  toast(`Timer started: ${formatTimer(secs)}`);
}
function stopTimer(id) { cookTimers = cookTimers.filter(t => t.id !== id); stopAlarmIfQuiet(); renderTimers() }
function addTimerMinute(id) { const t = cookTimers.find(x => x.id === id); if (!t) return; t.end = Math.max(Date.now(), t.end) + 60000; t.done = false; stopAlarmIfQuiet(); ensureTimerTick(); renderTimers() }
function formatTimer(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}` }
function ensureTimerTick() { if (!timerTick) timerTick = setInterval(timerStep, 500) }
function timerStep() {
  if (!cookTimers.length) { clearInterval(timerTick); timerTick = null; renderTimers(); return }
  for (const t of cookTimers) if (!t.done && Date.now() >= t.end) { t.done = true; timerDone(t) }
  renderTimers();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cookTimers.length) timerStep() });
let alarmCtx = null, alarmLoop = null;
function timerDone(t) {
  try { navigator.vibrate?.([400, 200, 400, 200, 400]) } catch (_) {}
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible')
      navigator.serviceWorker?.getRegistration().then(reg => reg?.showNotification('⏱ Time\'s up', { body: t.label, tag: 'gingham-timer', renotify: true, vibrate: [400, 200, 400] }));
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
    <span class="timer-label">${esc(t.label)}</span><b>${t.done ? 'Time\'s up!' : formatTimer(left)}</b>
    <button type="button" aria-label="Add a minute" onclick="addTimerMinute(${t.id})">+1</button><button type="button" aria-label="${t.done ? 'Stop alarm' : 'Cancel timer'}" onclick="stopTimer(${t.id})">${t.done ? 'Stop' : '✕'}</button></div>` }).join('');
}
// timers show inside cook mode, and in a small dock everywhere else so they're never lost
// Only the numbers change each tick; the buttons are rebuilt only when a timer starts, ends or is removed,
// so a tap on Stop or +1 never lands on a button that's being replaced.
function renderTimers() {
  const sig = cookTimers.map(t => t.id + (t.done ? 'd' : '')).join(',');
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
