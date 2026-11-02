// Hands-free cook mode (v38): Whole Kitchen reads each step aloud and listens for simple commands, so nobody has to touch
// the phone with messy hands. Uses the phone's own speech features (Web Speech API); nothing is recorded or sent to
// Whole Kitchen. On Android, Chrome's speech recognition is Google's service, so the policy says so.
'use strict';

const HF = { on: false, rec: null, speaking: false, heard: '', status: '', restartAt: 0, failures: 0, lastStep: -1, saidHelp: false };
const HF_HELP = 'Say “next”, “back”, “repeat”, “start timer”, “ingredients”, or “how much flour”.';
function handsFreeOn() { return HF.on }
function canListen() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition) }
function canSpeak() { return 'speechSynthesis' in window }

async function toggleHandsFree() { HF.on ? stopHandsFree(true) : startHandsFree() }
function startHandsFree() {
  if (!cookView) return;
  if (!canSpeak() && !canListen()) return toast('This phone\'s browser can\'t speak or listen');
  HF.on = true; HF.failures = 0; HF.lastStep = -1;
  try { localStorage.setItem(KEY + '-handsfree', '1') } catch (_) {}
  if (cookView.showIngredients && cookView.steps.length) cookView.showIngredients = false;
  renderCookMode();
  const intro = (canListen() ? 'Hands-free is on. ' + HF_HELP.replace(/[“”]/g, '') : 'I\'ll read each step aloud. Voice commands don\'t work in this browser.');
  HF.saidHelp = true;
  speak(intro + ' ' + stepSpeech(), () => { HF.lastStep = cookView?.step ?? -1; listen() });
}
function stopHandsFree(say, keepChoice) {
  HF.on = false; HF.status = '';
  try { HF.rec?.abort() } catch (_) {}
  HF.rec = null;
  try { speechSynthesis.cancel() } catch (_) {}
  if (!keepChoice) try { localStorage.removeItem(KEY + '-handsfree') } catch (_) {}
  if (say && canSpeak()) { const u = new SpeechSynthesisUtterance('Hands-free off.'); try { speechSynthesis.speak(u) } catch (_) {} }
  if (cookView) renderCookMode();
}
// extras.js calls this when the step changes (tapped or spoken)
function handsFreeStepChanged() {
  if (!HF.on || !cookView || cookView.showIngredients || HF.lastStep === cookView.step) return;
  HF.lastStep = cookView.step;
  speak(stepSpeech());
}
function handsFreeClosed() { if (HF.on) stopHandsFree(false, true) }   // closing cook mode: remember it was on

// ---------- speaking ----------
// what a step or amount sounds like: "1½ tbsp" → "1 and a half tablespoons", "350°F" → "350 degrees"
function speakable(t) {
  const fr = { '½': 'a half', '¼': 'a quarter', '¾': 'three quarters', '⅓': 'a third', '⅔': 'two thirds', '⅛': 'an eighth' };
  const dec = { '5': 'a half', '25': 'a quarter', '75': 'three quarters', '33': 'a third', '333': 'a third', '67': 'two thirds', '667': 'two thirds', '125': 'an eighth' };
  return String(t || '')
    .replace(/(^|[^\d.])(\d*)\.(5|25|75|333?|667?|125)(?![\d.])/g, (m, pre, whole, d) => pre + (Number(whole) ? whole + ' and ' : '') + dec[d])
    .replace(/(\d)\s*([½¼¾⅓⅔⅛])/g, (_, d, f) => `${d} and ${fr[f]}`).replace(/[½¼¾⅓⅔⅛]/g, f => fr[f])
    .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (_, a, b) => ({ '1/2': 'a half', '1/4': 'a quarter', '3/4': 'three quarters', '1/3': 'a third', '2/3': 'two thirds', '1/8': 'an eighth' })[`${a}/${b}`] || `${a} over ${b}`)
    .replace(/°\s*F\b/g, ' degrees').replace(/°\s*C\b/g, ' degrees Celsius').replace(/°/g, ' degrees')
    .replace(/\btbsp?s?\b\.?/gi, 'tablespoons').replace(/\btsps?\b\.?/gi, 'teaspoons').replace(/\boz\b\.?/gi, 'ounces').replace(/\blbs?\b\.?/gi, 'pounds')
    .replace(/\bfl ounces\b/gi, 'fluid ounces').replace(/\bpkgs?\b\.?/gi, 'packages').replace(/\bea\.(?=\s|$)/gi, '').replace(/\bmins?\b\.?/gi, 'minutes').replace(/\bhrs?\b\.?/gi, 'hours')
    .replace(/(\d)\s*g\b/g, '$1 grams').replace(/(\d)\s*ml\b/gi, '$1 milliliters').replace(/(\d)\s*kg\b/gi, '$1 kilograms')
    .replace(/\s+/g, ' ').trim();
}
function stepSpeech() {
  const c = cookView; if (!c) return '';
  if (!c.steps.length) return 'This recipe has no written steps.';
  const sys = typeof unitSystem === 'function' ? unitSystem() : 'us', text = typeof convertTemps === 'function' ? convertTemps(c.steps[c.step], sys) : c.steps[c.step];
  const timers = typeof stepTimers === 'function' ? stepTimers(c.steps[c.step]) : [];
  return `Step ${c.step + 1} of ${c.steps.length}. ${speakable(text)}${timers.length ? ' Say start timer for ' + speakable(timers[0].label) + '.' : ''}${c.step === c.steps.length - 1 ? ' That\'s the last step.' : ''}`;
}
function speak(text, then) {
  if (!canSpeak()) { then?.(); return }
  HF.speaking = true; HF.status = 'speaking'; paintHandsFree();
  try { HF.rec?.abort() } catch (_) {}        // don't hear ourselves
  try { speechSynthesis.cancel() } catch (_) {}
  const u = new SpeechSynthesisUtterance(text);
  u.lang = navigator.language || 'en-US'; u.rate = 0.97;
  const done = () => { if (!HF.speaking) return; HF.speaking = false; HF.status = ''; paintHandsFree(); if (then) then(); else listen() };
  u.onend = done; u.onerror = done;
  setTimeout(() => { if (HF.speaking && !speechSynthesis.speaking) done() }, Math.min(30000, 1500 + text.length * 90));   // some phones never fire onend
  try { speechSynthesis.speak(u) } catch (_) { done() }
}

// ---------- listening ----------
function listen() {
  if (!HF.on || HF.speaking || !canListen() || document.visibilityState !== 'visible') return;
  try { HF.rec?.abort() } catch (_) {}
  const R = window.SpeechRecognition || window.webkitSpeechRecognition, rec = new R();
  rec.lang = navigator.language || 'en-US'; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 3;
  rec.onstart = () => { HF.status = 'listening'; HF.failures = 0; paintHandsFree() };
  rec.onresult = e => {
    const res = e.results[e.results.length - 1]; if (!res?.isFinal) return;
    const options = [...res].map(a => a.transcript.trim().toLowerCase()).filter(Boolean);
    handsFreeCommand(options[0], options.slice(1));
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { HF.status = 'blocked'; paintHandsFree(); toast('Allow the microphone to use voice commands. Steps are still read aloud.'); HF.noMic = true; return }
    if (e.error !== 'no-speech' && e.error !== 'aborted') HF.failures++;
  };
  rec.onend = () => { if (HF.rec !== rec) return; HF.rec = null; if (HF.on && !HF.speaking && !HF.noMic && HF.failures < 5) setTimeout(listen, HF.failures ? 800 : 150); else if (HF.on && !HF.speaking) { HF.status = HF.noMic ? 'blocked' : 'paused'; paintHandsFree() } };
  HF.rec = rec;
  try { rec.start() } catch (_) { HF.rec = null }
}
document.addEventListener('visibilitychange', () => { if (!HF.on) return; if (document.visibilityState === 'visible') listen(); else try { HF.rec?.abort() } catch (_) {} });

// ---------- commands ----------
// Returns what it did (for the "Heard" line and tests). Phrases are matched loosely: "okay next step please" → next.
function handsFreeCommand(said, alternatives = []) {
  const c = cookView; if (!c || !said) return '';
  const r = state.data.recipes[c.name];
  for (const text of [said, ...alternatives]) {
    const t = ' ' + text.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    const has = re => re.test(t);
    let did = '';
    if (has(/ (stop|turn off|end) (listening|hands ?free|voice) | hands ?free off /)) { stopHandsFree(true); did = 'off' }
    else if (has(/ (stop|cancel|silence|quiet|dismiss)( the)? (timer|alarm|beeping)s? | (stop|silence|quiet|ok|okay)( it)? $/) && cookTimers.length) {
      const ringing = cookTimers.filter(x => x.done), list = ringing.length ? ringing : cookTimers.slice(-1);
      list.forEach(x => stopTimer(x.id)); did = 'stop timer'; speak(ringing.length ? 'Timer stopped.' : 'Timer cancelled.');
    }
    else if (has(/ (how much|how long|what's|what is)( time)?( is)? (left|remaining)| time left | how long (is )?left /)) {
      did = 'time left';
      speak(cookTimers.length ? cookTimers.map(x => (x.done ? 'Your ' + speakable(x.label) + ' timer is done.' : speakable(formatTimerWords(Math.round((x.end - Date.now()) / 1000))) + ' left on ' + speakable(x.label) + '.')).join(' ') : 'No timers are running.');
    }
    else if (has(/ (start|set|begin)( a| the| my)? timer| timer for /)) {
      const asked = typeof stepTimers === 'function' ? stepTimers(t.replace(/ timer for /, ' ')) : [];
      const fromStep = typeof stepTimers === 'function' && c.steps.length ? stepTimers(c.steps[c.step]) : [];
      const pick = asked[0] || fromStep[0];
      did = 'timer';
      if (pick && typeof startTimer === 'function') { startTimer(pick.secs, asked[0] ? 'Timer' : pick.label); speak('Timer started for ' + speakable(formatTimerWords(pick.secs)) + '.') }
      else speak('This step has no time in it. Say, set a timer for 10 minutes.');
    }
    else if (has(/ (go to|jump to|read)? ?step (\d+|one|two|three|four|five|six|seven|eight|nine|ten) /)) {
      const w = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }, m = t.match(/ step (\d+|one|two|three|four|five|six|seven|eight|nine|ten) /);
      const n = Number(m[1]) || w[m[1]];
      if (n >= 1 && n <= c.steps.length) { c.showIngredients = false; c.step = n - 1; HF.lastStep = -1; renderCookMode(); handsFreeStepChanged(); did = 'step ' + n } else { speak(`There are ${c.steps.length} steps.`); did = 'step?' }
    }
    else if (has(/ (how much|how many|amount of|quantity of) /)) {
      const what = t.replace(/^.*?(how much|how many|amount of|quantity of) /, '').replace(/ (do i need|is it|are there|goes in|in it|again|please) .*$| (do i need|please) $/, '').replace(/^(the|of|a|an) /, '').trim();
      const i = findIngredient(r, what);
      did = 'amount';
      speak(i ? `${speakable(plainAmount(i, c.scale))} ${speakable(i.name)}${i.note ? ', ' + speakable(i.note) : ''}.` : `I couldn't find ${what || 'that'} in this recipe.`);
    }
    else if (has(/ (ingredients|what do i need|shopping|what goes in) /)) {
      did = 'ingredients';
      speak('You need: ' + (r.ingredients || []).map(i => `${speakable(plainAmount(i, c.scale))} ${speakable(i.name)}`).join('; ') + '.');
    }
    else if (has(/ (next|continue|go on|forward|done with (this|that)|what's next|then what) /)) {
      did = 'next';
      if (c.showIngredients) { c.showIngredients = false; HF.lastStep = -1; renderCookMode(); handsFreeStepChanged() }
      else if (c.step < c.steps.length - 1) cookMove(1);
      else speak('That was the last step. Say finish to close cook mode.');
    }
    else if (has(/ (back|previous|go back|last step|before) /)) { did = 'back'; if (c.step > 0) cookMove(-1); else speak('This is the first step.') }
    else if (has(/ (repeat|again|say that|what was that|pardon|read (it|the step|this)|what did you say|come again) /)) { did = 'repeat'; HF.lastStep = -1; c.showIngredients = false; renderCookMode(); handsFreeStepChanged() }
    else if (has(/ (finish|finished|all done|close|exit)( cooking| cook mode)? /) || (has(/ done /) && c.step === c.steps.length - 1)) { did = 'finish'; closeCookMode(true) }
    else if (has(/ (help|what can i say|commands) /)) { did = 'help'; speak(HF_HELP.replace(/[“”]/g, '')) }
    if (did) { HF.heard = text; if (cookView) paintHandsFree(); return did }
  }
  HF.heard = said + ' (?)'; paintHandsFree();
  return '';
}
function formatTimerWords(s) {
  s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60, out = [];
  if (h) out.push(h + (h === 1 ? ' hour' : ' hours')); if (m) out.push(m + (m === 1 ? ' minute' : ' minutes')); if (!h && sec && m < 5) out.push(sec + ' seconds');
  return out.join(' ') || 'less than a second';
}
function plainAmount(i, scale) {
  const html = typeof cookAmountHTML === 'function' ? cookAmountHTML(i, scale) : displayQty(i, scale) + ' ' + (i.unit || '');
  const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim();
}
// "flour" → "All-purpose flour"; "eggs" → "Large eggs"; plural/singular forgiving
function findIngredient(r, what) {
  const w = what.replace(/(es|s)$/, ''), list = r?.ingredients || [];
  if (!w) return null;
  const words = w.split(' ').filter(x => x.length > 1);
  return list.find(i => i.name.toLowerCase() === what) || list.find(i => i.name.toLowerCase().includes(w))
    || list.find(i => words.every(x => i.name.toLowerCase().includes(x.replace(/(es|s)$/, '')))) || list.find(i => words.some(x => x.length > 3 && i.name.toLowerCase().includes(x.replace(/(es|s)$/, '')))) || null;
}

// ---------- the bar in cook mode ----------
function handsFreeBarHTML() {
  if (!HF.on) return '';
  const st = HF.status === 'speaking' ? '🔊 Reading…' : HF.status === 'listening' ? '🎙 Listening' : HF.status === 'blocked' ? '🎙 Microphone off: reading aloud only' : !canListen() ? '🔊 Reading aloud' : HF.status === 'paused' ? '🎙 Paused: tap to listen' : '🎙 Starting…';
  return `<div class="hf-bar ${HF.status}" role="status"><button class="hf-state" onclick="${HF.status === 'paused' ? 'HF.failures=0;listen()' : 'HF.lastStep=-1;handsFreeStepChanged()'}">${st}</button>
    <span class="hf-heard">${HF.heard ? 'Heard: “' + esc(HF.heard) + '”' : canListen() ? esc(HF_HELP) : ''}</span></div>`;
}
function paintHandsFree() {
  const el = document.getElementById('hfBar'); if (el) el.innerHTML = handsFreeBarHTML();
  const b = document.querySelector('.cook-voice'); if (b) { b.classList.toggle('on', HF.on); b.setAttribute('aria-pressed', String(HF.on)) }
}
