// Settings (v44): a list of grouped rows, like most phone apps. Each row opens its own page inside the
// Settings screen; the cards on those pages (#familyCard, #remindersCard, ...) are the same ones as before.
let settingsPage = null;
const APP_VERSION = '46';

function openSettingsPage(name) {
  showScreen('settings');   // draws every card fresh (signed in or not, reminders on or off) and resets to the list
  const page = document.getElementById('setPage-' + name); if (!page) return;
  document.getElementById('setHome').hidden = true;
  document.querySelectorAll('#settings .set-page').forEach(p => p.hidden = p !== page);
  settingsPage = name;
  if (name === 'people' && typeof renderPeopleCard === 'function') renderPeopleCard();
  if (name === 'help' && typeof renderGuideCard === 'function') { renderGuideCard(); if (typeof renderShareCodeLine === 'function') renderShareCodeLine() }
  window.scrollTo(0, 0);
  page.querySelector('.set-head h2')?.focus?.();
}
function closeSettingsPage() {
  if (!settingsPage) return false;
  settingsPage = null;
  document.querySelectorAll('#settings .set-page').forEach(p => p.hidden = true);
  const home = document.getElementById('setHome'); if (home) home.hidden = false;
  renderSettingsHome();
  window.scrollTo(0, 0);
  return true;
}
// showScreen('settings') always starts at the list
function resetSettingsPage() {
  settingsPage = null;
  document.querySelectorAll('#settings .set-page').forEach(p => p.hidden = true);
  const home = document.getElementById('setHome'); if (home) home.hidden = false;
}

// the small grey line under each row: what it's set to right now
function renderSettingsHome() {
  const set = (id, text) => { const el = document.querySelector(`#${id} small`); if (el) el.textContent = text };
  const n = Object.keys(state.people || {}).length;
  set('setRowPeople', n ? `${n} ${n === 1 ? 'person' : 'people'} · likes and won't-eats` : 'Add who you cook for');
  const auth = typeof syncAuth !== 'undefined' ? syncAuth : null, info = typeof syncInfo !== 'undefined' ? syncInfo : null;
  const configured = typeof syncConfigured !== 'undefined' && syncConfigured;
  set('setRowFamily', !configured ? 'Not set up on this copy of the app' : info?.familyName ? `${info.familyName}${info.paused ? ' · paused' : ''}` : auth ? 'Signed in · create or join a family' : 'Off · share recipes, plans and lists');
  const r = state.planPrefs?.reminders;
  set('setRowReminders', r?.on ? 'On · thaw, slow cooker and start-cooking reminders' : 'Off');
  const style = typeof pictureStyle === 'function' ? pictureStyle() : 'photos';
  set('setRowPictures', style === 'photos' ? 'Photos' : 'Illustrations');
  const who = document.getElementById('setWho'), sub = document.getElementById('setWhoSub'), av = document.getElementById('setAvatar');
  if (who && sub && av) {
    const email = auth?.user?.email || '';
    who.textContent = email || 'Not signed in';
    sub.textContent = info?.familyName ? `${info.familyName}${info.displayName ? ' · you’re ' + info.displayName : ''}` : email ? 'Create or join a family to share' : 'Sign in to share recipes and lists with your family';
    if (email) av.textContent = email[0].toUpperCase();
    else if (!av.querySelector('svg')) av.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-user"/></svg>';
    av.classList.toggle('on', !!email);
  }
  const v = document.getElementById('setVersion'); if (v) v.textContent = `Whole Kitchen · version ${APP_VERSION}`;
  if (typeof listSnapshots === 'function') listSnapshots().then(s => {
    const last = s[0]; set('setRowBackups', last ? `Last automatic copy ${new Date(last.id).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · save or restore` : 'Save a backup file or go back to an earlier copy');
  }).catch(() => {});
}
