// In-app messages and questions (v24), in place of the browser's plain pop-ups.
//   await ask('Delete this?', {ok: 'Delete', danger: true})  -> true / false
//   alert('Saved')  -> shows an in-app message (doesn't stop the page)
'use strict';

let appDialogResolve = null;
function appDialog({ title = '', message = '', ok = 'OK', cancel = null, danger = false }) {
  return new Promise(resolve => {
    if (appDialogResolve) appDialogResolve(false);   // only one at a time
    appDialogResolve = resolve;
    let el = document.getElementById('appDialog');
    if (!el) { el = document.createElement('div'); el.id = 'appDialog'; el.className = 'app-dialog-overlay'; document.body.appendChild(el) }
    const text = String(message || '');
    // first line becomes the heading when there's a blank line after it ("Delete X?\n\nDetails…")
    const [head, ...rest] = title ? [title, text] : text.includes('\n\n') ? [text.split('\n\n')[0], text.split('\n\n').slice(1).join('\n\n')] : ['', text];
    el.innerHTML = `<div class="app-dialog" role="${cancel ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="appDialogText">
      <div id="appDialogText">${head ? `<h3>${esc(head)}</h3>` : ''}${rest.join('').trim() ? `<p>${esc(rest.join('').trim()).replace(/\n/g, '<br>')}</p>` : ''}</div>
      <div class="actions">${cancel ? `<button type="button" class="btn secondary" onclick="closeAppDialog(false)">${esc(cancel)}</button>` : ''}<button type="button" class="btn ${danger ? 'danger-solid' : ''}" onclick="closeAppDialog(true)">${esc(ok)}</button></div></div>`;
    el.hidden = false;
    document.body.classList.add('dialog-open');
    setTimeout(() => el.querySelector('.actions .btn:last-child')?.focus(), 30);
  });
}
function closeAppDialog(answer) {
  const el = document.getElementById('appDialog');
  if (el) el.hidden = true;
  document.body.classList.remove('dialog-open');
  const r = appDialogResolve; appDialogResolve = null;
  if (r) r(!!answer);
}
function appDialogOpen() { const el = document.getElementById('appDialog'); return !!el && !el.hidden }
document.addEventListener('keydown', e => { if (appDialogOpen() && e.key === 'Escape') { e.preventDefault(); closeAppDialog(false) } }, true);

// Pick sensible button words from the question itself ("Delete …?" -> Delete / Cancel).
function askWords(message) {
  const m = String(message || '').trim().match(/^(Delete|Remove|Clear|Reset|Replace|Restore|Import|Apply|Stop syncing|Merge|Join|Create)/i);
  const verb = m ? m[1].replace(/^\w/, c => c.toUpperCase()) : 'OK';
  return { ok: verb === 'Stop syncing' ? 'Stop syncing' : verb, danger: /^(Delete|Remove|Clear|Reset|Replace)/i.test(verb) };
}
// Automated tests drive the browser's own pop-ups; real people get the in-app version.
const NATIVE_DIALOGS = !!navigator.webdriver && !window.GINGHAM_APP_DIALOGS;
function ask(message, opts = {}) {
  if (NATIVE_DIALOGS) return Promise.resolve(window.confirm(message));
  const w = askWords(message);
  return appDialog({ message, ok: opts.ok || w.ok, cancel: opts.cancel || 'Cancel', danger: opts.danger ?? w.danger, title: opts.title });
}
if (!NATIVE_DIALOGS) window.alert = message => { appDialog({ message: String(message ?? ''), ok: 'OK' }) };
