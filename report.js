// Settings → Help & feedback (v37).
// A problem report is what the person types, plus (if they leave it ticked) technical details: app version, phone
// model, which screen, and the last few app errors recorded on this phone. No recipes, names, emails or photos.
// It's saved to the table rg_problem_reports (launch-setup.sql), which only the Supabase owner can read.
'use strict';

async function appVersion() {
  try { const k = (await caches.keys()).find(n => /^gingham-v\d+/.test(n)); if (k) return k.replace('gingham-', '') } catch (_) {}
  return 'web';
}
async function deviceLine() {
  let model = '', os = '';
  try { if (navigator.userAgentData?.getHighEntropyValues) { const h = await navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion']); model = h.model || ''; os = (navigator.userAgentData.platform || '') + ' ' + (h.platformVersion || '') } } catch (_) {}
  const ua = navigator.userAgent.replace(/\s+/g, ' ');
  const browser = (ua.match(/(Chrome|Firefox|Version)\/[\d.]+/) || [''])[0].replace('Version', 'Safari');
  return [model, os.trim() || (ua.match(/Android [\d.]+|iPhone OS [\d_]+|Windows NT [\d.]+|Mac OS X [\d_]+/) || [''])[0], browser].filter(Boolean).join(' · ').slice(0, 400);
}
async function buildReport(message, withDetails, contactOk) {
  const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth;
  const r = { app_version: await appVersion(), screen: (document.querySelector('.screen.active') || {}).id || '', message: String(message || '').trim().slice(0, 2000), contact_ok: !!(contactOk && signedIn) };
  if (withDetails) {
    r.device = await deviceLine();
    r.errors = {
      recent: (typeof recentAppErrors === 'function' ? recentAppErrors() : []).slice(-10),
      info: {
        recipes: Object.keys(state.data?.recipes || {}).length, plannedMeals: Object.keys(state.plan || {}).length,
        pantryItems: Object.keys(state.pantry || {}).length, signedIn, familySync: typeof syncActive === 'function' && syncActive(),
        installed: matchMedia('(display-mode: standalone)').matches, online: navigator.onLine, language: navigator.language,
        window: `${innerWidth}x${innerHeight}`, darkMode: matchMedia('(prefers-color-scheme: dark)').matches,
      },
    };
  }
  return r;
}
function reportPreviewText(r) {
  const lines = [`Gingham ${r.app_version} · screen: ${r.screen || '—'}`];
  if (r.device) lines.push('Phone: ' + r.device);
  if (r.errors) {
    const i = r.errors.info; lines.push(`Recipes ${i.recipes}, planned meals ${i.plannedMeals}, pantry items ${i.pantryItems} · signed in: ${i.signedIn ? 'yes' : 'no'} · installed: ${i.installed ? 'yes' : 'no'} · ${i.window}`);
    lines.push(r.errors.recent.length ? 'Recent errors:\n' + r.errors.recent.map(e => `• ${e.at.slice(0, 16).replace('T', ' ')} ${e.screen ? '[' + e.screen + '] ' : ''}${e.msg}${e.n > 1 ? ` (×${e.n})` : ''}${e.stack ? '\n   ' + e.stack : ''}`).join('\n') : 'No recent errors recorded.');
  }
  if (r.contact_ok) lines.push('OK to email about this: yes');
  return lines.join('\n');
}
function openProblemReport() {
  const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth, errs = typeof recentAppErrors === 'function' ? recentAppErrors().length : 0;
  openModal(`<div class="row between"><h2>Send a problem report</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <label for="repMsg">What happened?</label>
    <textarea id="repMsg" rows="5" maxlength="2000" placeholder="What were you doing, what did you expect, and what happened instead?"></textarea>
    <label class="check-row"><input type="checkbox" id="repDetails" checked onchange="refreshReportPreview()"> Include technical details${errs ? ` (${errs} recent error${errs === 1 ? '' : 's'})` : ''}</label>
    ${signedIn ? '<label class="check-row"><input type="checkbox" id="repContact" onchange="refreshReportPreview()"> It\'s OK to email me about this</label>' : ''}
    <details class="rep-preview"><summary class="small">See exactly what's sent</summary><pre id="repPreview" class="tiny"></pre>
      <p class="tiny muted">No recipes, names, emails, photos or your location. ${signedIn ? 'Your account is attached so a reply can reach you only if you tick the box above.' : ''}</p></details>
    <div id="repMsgLine" class="small" role="status"></div>
    <div class="actions"><button class="btn" id="repSend" onclick="sendProblemReport()">Send report</button><button class="btn secondary" onclick="closeModal()">Cancel</button></div>`);
  refreshReportPreview();
}
async function refreshReportPreview() {
  const pre = document.getElementById('repPreview'); if (!pre) return;
  pre.textContent = reportPreviewText(await buildReport('', document.getElementById('repDetails')?.checked, document.getElementById('repContact')?.checked));
}
async function sendProblemReport() {
  const msgEl = document.getElementById('repMsg'), line = document.getElementById('repMsgLine'), btn = document.getElementById('repSend');
  const say = (t, cls = 'muted') => { line.className = 'small ' + cls; line.textContent = t };
  if (!msgEl.value.trim()) { say('Say a few words about what happened.', 'warning'); msgEl.focus(); return }
  const r = await buildReport(msgEl.value, document.getElementById('repDetails').checked, document.getElementById('repContact')?.checked);
  btn.disabled = true; say('Sending…');
  try {
    if (typeof syncConfigured === 'undefined' || !syncConfigured) throw Object.assign(new Error('not set up'), { notSetUp: true });
    const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth;
    const res = await fetch(SYNC_URL + '/rest/v1/rg_problem_reports', { method: 'POST',
      headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + (signedIn ? await accessToken() : SYNC_KEY_ANON), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(r) });
    if (!res.ok) { const j = await readJSON(res); throw Object.assign(new Error(j?.message || 'status ' + res.status), { notSetUp: res.status === 404 || /rg_problem_reports|42P01|PGRST20/.test((j?.message || '') + (j?.code || '')) }) }
    if (typeof clearAppErrors === 'function') clearAppErrors();
    closeModal(); toast('Thanks! Report sent');
  } catch (e) {
    btn.disabled = false;
    const text = msgEl.value.trim() + '\n\n' + reportPreviewText(r);
    if (e instanceof TypeError) return say('No internet right now. Try again when you\'re back online.', 'warning');
    // not set up (or refused): hand the report over another way rather than losing it
    try { await navigator.clipboard.writeText(text) } catch (_) {}
    say(e.notSetUp ? 'Reports aren\'t switched on in Supabase yet (launch-setup.sql). The report was copied, so you can paste it into an email.' : 'Couldn\'t send it (' + e.message + '). The report was copied, so you can paste it into an email.', 'warning');
  }
}

// ---------- Today's usage of the helper (daily limits) ----------
async function openUsageToday() {
  openModal(`<div class="row between"><h2>Today's usage</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">Each account can use the online helpers a set number of times a day, which keeps Gingham free for everyone.</p><div id="usageBox" class="small muted">Checking…</div>`);
  const box = document.getElementById('usageBox');
  try {
    const j = await callHelper({ action: 'limits' });
    if (!j || !j.limits) throw new Error('The helper needs updating: paste the newest recipe-import.ts into Supabase and Deploy.');
    const order = ['read-card', 'url', 'image', 'nutrition', 'portions', 'kroger-stores', 'kroger-prices'];
    box.className = '';
    box.innerHTML = (j.ready ? '' : '<p class="small warning">Daily limits aren\'t switched on yet. In Supabase → SQL Editor, run launch-setup.sql once.</p>') +
      order.filter(k => j.limits[k]).map(k => { const max = j.limits[k], used = Math.min(max, j.used?.[k] || 0), pct = Math.min(100, used / max * 100);
        return `<div class="usage-row"><span>${esc((s => s[0].toUpperCase() + s.slice(1))(j.names?.[k] || k))}</span><b>${used} of ${max}</b><span class="usage-bar"><span style="width:${pct}%" class="${pct >= 90 ? 'hot' : ''}"></span></span></div>` }).join('') +
      `<p class="tiny muted">Counts start over in about ${j.resetsInHours} hour${j.resetsInHours === 1 ? '' : 's'}.</p>`;
  } catch (e) { box.className = 'small warning'; box.textContent = e.signin ? 'Sign in under Family sync to see your usage.' : /web address/i.test(e.message) ? 'Your Supabase helper is an older version: paste the newest recipe-import.ts into recipe-imports and Deploy.' : e.message }
}
