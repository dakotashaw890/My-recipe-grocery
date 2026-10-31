// Settings → Setup check: tests each Supabase piece the app uses and says what (if anything) to fix.
const SETUP_CHECKS = [
  { id: 'sync', title: 'Family sync', run: checkSync },
  { id: 'photos', title: 'Photo storage', run: checkPhotos },
  { id: 'community', title: 'Community recipes', run: checkCommunity },
  { id: 'helper', title: 'Recipe link helper', run: checkHelper },
  { id: 'kroger', title: 'Kroger store prices', run: checkKroger },
  { id: 'nutrition', title: 'Nutrition facts', run: checkNutrition },
  { id: 'deletion', title: 'Account deletion', run: checkDeletion },
];
let setupResults = null, setupRunning = false;

const setupOk = (msg) => ({ state: 'ok', msg });
const setupBad = (msg, fix) => ({ state: 'bad', msg, fix });
const setupWarn = (msg, fix) => ({ state: 'warn', msg, fix });
const offline = () => setupWarn('Couldn\'t reach Supabase.', 'Check your internet connection and run the check again.');
const needsFamily = () => setupWarn('Needs family sync first.', 'Create or join a family in Family sync above, then run the check again.');

async function checkSync() {
  if (typeof syncConfigured === 'undefined' || !syncConfigured) return setupBad('Not connected to Supabase.', 'sync-config.js needs your Supabase web address and publishable key (SYNC-SETUP.md).');
  if (!syncAuth || !syncInfo?.familyId) return setupWarn('This phone isn\'t in a family yet.', 'Use Family sync above to create a family or join with a code.');
  try { await accessToken() } catch (e) { return e instanceof TypeError ? offline() : setupBad('Signed out.', 'Sign in again in Family sync above.') }
  const last = syncInfo.lastSyncAt ? ' Last synced ' + new Date(syncInfo.lastSyncAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + '.' : '';
  return setupOk(`Signed in to “${syncInfo.familyName || 'your family'}”.` + last);
}
async function checkPhotos() {
  if (typeof syncActive !== 'function' || !syncActive()) return needsFamily();
  try { await storedPhotoIds(); return setupOk('Photos are stored in Supabase Storage.') }
  catch (e) {
    if (e.missingBucket) return setupBad('Photo storage isn\'t set up.', 'In Supabase → SQL Editor, run photo-storage-setup.sql once (PHOTO-SETUP.md).');
    if (e instanceof TypeError) return offline();
    return setupBad('Photo storage answered with an error: ' + e.message, 'Run photo-storage-setup.sql again in the Supabase SQL Editor.');
  }
}
async function checkCommunity() {
  if (typeof communityRest !== 'function' || typeof syncConfigured === 'undefined' || !syncConfigured) return setupWarn('Needs the Supabase connection.', 'Set up family sync first.');
  try { await communityRest('GET', 'rg_public_recipes?select=id&limit=1'); return setupOk('The shared recipe library is working.') }
  catch (e) {
    if (e instanceof TypeError) return offline();
    return setupBad('The shared library isn\'t set up.', 'In Supabase → SQL Editor, run community-setup.sql once (COMMUNITY-SETUP.md).');
  }
}
// The helper answers a request with no link with "doesn't look like a web address": that proves it's deployed and reachable.
async function helperProbe(body) {
  try { return { j: await callHelper(body) } } catch (e) { return { e } }
}
function helperProblem(e) {
  if (e.signin) return needsFamily();
  if (e instanceof TypeError) return offline();
  if (/web address/i.test(e.message)) return setupBad('Your helper is an older version.', 'Paste the newest recipe-import.ts into the recipe-imports Edge Function and press Deploy.');
  if (/needs updating/.test(e.message)) return setupBad('The helper Edge Function wasn\'t found.', 'In Supabase → Edge Functions, create “recipe-imports” (Verify JWT off) and paste in recipe-import.ts (IMPORT-SETUP.md). If you named it differently, put that name in sync-config.js as importFunction.');
  return null;
}
async function checkHelper() {
  const { e } = await helperProbe({ url: '' });
  if (!e) return setupOk('Recipe links can be imported.');
  if (/web address/i.test(e.message)) return setupOk('Recipe links can be imported.');
  return helperProblem(e) || setupBad('The helper answered with an error: ' + e.message, 'Check the recipe-imports function\'s Logs in Supabase.');
}
async function checkKroger() {
  const { j, e } = await helperProbe({ action: 'kroger-stores', zip: '45202' });
  if (j) return setupOk('Kroger answered' + (j.stores ? ` (${j.stores.length} test stores found).` : '.'));
  if (e.setup && !/wasn't found|needs updating/.test(e.message)) return setupBad('Kroger keys missing or wrong.', 'In Supabase → Edge Functions → Secrets, add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET (all capital letters) from developer.kroger.com, then check again.');
  return helperProblem(e) || setupBad('Kroger answered with an error: ' + e.message, 'Check the recipe-imports function\'s Logs in Supabase.');
}
async function checkNutrition() {
  const { j, e } = await helperProbe({ action: 'nutrition', terms: ['apple'] });
  if (j) return setupOk('USDA nutrition lookups are working.');
  if (e.setup && !/wasn't found|needs updating/.test(e.message)) return setupBad('USDA key missing.', 'In Supabase → Edge Functions → Secrets, add FDC_API_KEY (from fdc.nal.usda.gov/api-key-signup), then check again.');
  return helperProblem(e) || setupBad('Nutrition lookup answered with an error: ' + e.message, 'Check the recipe-imports function\'s Logs in Supabase.');
}

async function checkDeletion() {
  if (typeof syncActive !== 'function' || !syncActive()) return needsFamily();
  try {
    const r = await fetch(SYNC_URL + '/rest/v1/rpc/rg_family_size', { method: 'POST', headers: { apikey: SYNC_KEY_ANON, Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fid: '00000000-0000-0000-0000-000000000000' }) });
    if (r.ok) return setupOk('People can delete their account (required by Google Play).');
    return setupBad('Account deletion isn\'t set up.', 'In Supabase → SQL Editor, run account-deletion.sql once.');
  } catch (e) { return offline() }
}
async function runSetupCheck() {
  if (setupRunning) return;
  setupRunning = true; setupResults = {}; renderSetupCheck();
  // the first check decides whether the sign-in is good; the rest can run together
  setupResults.sync = await SETUP_CHECKS[0].run().catch(e => setupBad(e.message)); renderSetupCheck();
  await Promise.all(SETUP_CHECKS.slice(1).map(async c => { setupResults[c.id] = await c.run().catch(e => setupBad(e.message)); renderSetupCheck() }));
  setupRunning = false; renderSetupCheck();
  try { localStorage.setItem(KEY + '-setupCheck', JSON.stringify({ at: Date.now(), results: setupResults })) } catch (_) {}
}
function renderSetupCheck() {
  const box = document.getElementById('setupCheckCard'); if (!box) return;
  let saved = setupResults;
  if (!saved) { try { const s = JSON.parse(localStorage.getItem(KEY + '-setupCheck') || 'null'); if (s) { saved = s.results; box.dataset.at = s.at } } catch (_) {} }
  const rows = SETUP_CHECKS.map(c => {
    const r = saved?.[c.id], cls = r ? r.state : '', mark = !r ? (setupRunning ? '…' : '·') : r.state === 'ok' ? '✓' : r.state === 'warn' ? '!' : '✕';
    return `<div class="setup-row ${cls}"><span class="mark" aria-hidden="true">${mark}</span><div class="what"><b>${esc(c.title)}</b><div class="small ${r ? '' : 'muted'}">${r ? esc(r.msg) : setupRunning ? 'Checking…' : 'Not checked yet'}</div>${r?.fix ? `<div class="small fix">→ ${esc(r.fix)}</div>` : ''}</div></div>`;
  }).join('');
  const done = saved && SETUP_CHECKS.every(c => saved[c.id]), allOk = done && SETUP_CHECKS.every(c => saved[c.id].state === 'ok');
  const when = !setupRunning && !setupResults && box.dataset.at ? `<span class="tiny muted"> · last checked ${esc(new Date(Number(box.dataset.at)).toLocaleDateString())}</span>` : '';
  box.innerHTML = `<h3>Setup check</h3><p class="muted small">Tests each Supabase piece Gingham uses and tells you exactly what to fix.${when}</p>${allOk && !setupRunning ? '<p class="small" style="color:var(--olive-text)"><b>✓ Everything is set up.</b></p>' : ''}${rows}<div class="actions"><button class="btn secondary" onclick="runSetupCheck()" ${setupRunning ? 'disabled' : ''}>${setupRunning ? 'Checking…' : saved ? 'Check again' : 'Run setup check'}</button></div>`;
}
