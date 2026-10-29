// Getting recipes in from other apps (v21):
//  - Share → Gingham from TikTok, Instagram, YouTube, Pinterest, Facebook, Chrome or a recipe app
//  - Reading a photo of a cookbook page or recipe card (text recognition runs on the phone)
'use strict';

// ---------- Share → Gingham ----------
// manifest.json registers Gingham as a share target; Android opens index.html?share_text=…&share_url=…
function sharedContent() {
  const q = new URLSearchParams(location.search);
  if (!['share_title', 'share_text', 'share_url'].some(k => q.has(k))) return null;
  const title = q.get('share_title') || '', text = q.get('share_text') || '', url = q.get('share_url') || '';
  const link = (url.match(/https?:\/\/\S+/) || text.match(/https?:\/\/\S+/) || title.match(/https?:\/\/\S+/) || [])[0]?.replace(/[.,!?)\]]+$/, '') || '';
  return { title, text, link };
}
function handleShareLaunch() {
  const shared = sharedContent();
  if (!shared) return;
  // tidy the address bar so a reload doesn't import again
  try { history.replaceState(history.state, '', location.pathname) } catch (_) {}
  showScreen('recipes');
  const signedIn = typeof syncAuth !== 'undefined' && !!syncAuth && syncConfigured;
  if (shared.link) {
    openRecipeImport({ url: shared.link });
    if (signedIn) importFromLink();
    else importMessage('Sign in under ⚙️ Family sync to import from links. Or open the post, copy its text, and paste it below.', true);
    return;
  }
  // shared text with no link (a recipe app sharing the recipe itself, a note, an email)
  const text = [shared.title, shared.text].filter(Boolean).join('\n');
  const p = parseRecipeText(normalizeRecipeText(text));
  if (p.ingredients.length >= 2) openImportedRecipe({ name: p.name || shared.title, servings: p.servings, ingredients: p.ingredients, steps: p.steps, prepMinutes: p.prepMinutes, cookMinutes: p.cookMinutes, sourceType: 'Shared to Gingham' });
  else openRecipeImport({ text: normalizeRecipeText(text), note: 'Here\'s what was shared. Put each ingredient on its own line, then tap Read recipe text.', sourceType: 'Shared to Gingham' });
}
window.addEventListener('load', () => setTimeout(handleShareLaunch, 300));

// ---------- Photo of a recipe ----------
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let tesseractReady = null;
function loadTesseract() {
  tesseractReady ??= new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script'); s.src = TESSERACT_URL; s.async = true;
    s.onload = () => window.Tesseract ? resolve() : reject(new Error('Text reader missing'));
    s.onerror = () => { tesseractReady = null; reject(new Error('Text reader failed to load')) };
    document.head.appendChild(s);
  });
  return tesseractReady;
}
function ocrStatus(text, bad) { const el = document.getElementById('ocrStatus'); if (el) { el.textContent = text; el.className = 'small ' + (bad ? 'warning' : 'muted') } }
// Scale big phone photos down (faster, and the reader works best around 2000px), grey them, lift the contrast a little.
async function photoForReading(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.25)'; g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}
let ocrBusy = false;
async function readRecipePhotos(fileList) {
  const files = [...(fileList || [])].filter(f => /^image\//.test(f.type)).slice(0, 6);
  if (!files.length || ocrBusy) return;
  ocrBusy = true;
  const buttons = document.querySelectorAll('#sheet button'); buttons.forEach(b => b.disabled = true);
  let worker = null;
  try {
    ocrStatus(navigator.onLine === false && !window.Tesseract ? 'The text reader downloads once the first time (about 5 MB). Connect to the internet and try again.' : 'Getting the text reader ready… (the first time downloads about 5 MB)');
    await loadTesseract();
    let page = 0;
    worker = await Tesseract.createWorker('eng', 1, {
      logger: m => { if (m.status === 'recognizing text') ocrStatus(`Reading photo ${page}${files.length > 1 ? ' of ' + files.length : ''}… ${Math.round((m.progress || 0) * 100)}%`) }
    });
    const texts = [];
    for (const f of files) {
      page++;
      ocrStatus(`Reading photo ${page}${files.length > 1 ? ' of ' + files.length : ''}…`);
      const { data } = await worker.recognize(await photoForReading(f));
      texts.push(String(data?.text || '').trim());
    }
    const text = cleanOcrText(texts.filter(Boolean).join('\n\n'));
    if (!text) { ocrStatus('No text found in that photo. Try again with the page flat, well lit and filling the frame.', true); return }
    const box = document.getElementById('importText');
    if (box) { box.value = normalizeRecipeText(text); box.rows = 14; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); box.focus({ preventScroll: true }) }
    window.importContext = { ...(window.importContext || {}), sourceType: 'Imported from a photo' };
    ocrStatus('Done. Check the text below and fix anything the reader got wrong, then tap Read recipe text.');
  } catch (e) {
    console.error(e);
    ocrStatus(e?.message?.includes('load') ? 'The text reader couldn\'t download. Check your connection and try again.' : 'Couldn\'t read that photo. Try another, or type the recipe in below.', true);
  } finally {
    try { await worker?.terminate() } catch (_) {}
    ocrBusy = false; buttons.forEach(b => b.disabled = false);
    ['ocrCamera', 'ocrLibrary'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '' });
  }
}
// Common misreads in recipe text: "l/2" for "1/2", "1 /2", stray bullets and page furniture.
function cleanOcrText(t) {
  return String(t || '')
    .replace(/\r/g, '')
    .replace(/(^|\s)[lI|](?=\/\d)/gm, (m, a) => a + '1')    // l/2 -> 1/2
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')                 // 1 / 2 -> 1/2
    .replace(/(^|\s)[oO](?=\s*(cups?|tbsp|tsp|oz)\b)/g, (m, a) => a + '0')
    .replace(/^[\s•·*○●◦■□▪-]+(?=\S)/gm, '')               // bullet marks
    .replace(/^\s*(page\s*)?\d{1,3}\s*$/gim, '')            // page numbers
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
