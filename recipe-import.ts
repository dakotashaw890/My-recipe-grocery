// Gingham: recipe import helper (Supabase Edge Function "recipe-import").
// Paste this whole file into Supabase → Edge Functions → Deploy a new function → Via Editor.
// It fetches a recipe web page and returns the recipe that most recipe sites publish
// inside the page (schema.org "Recipe" data). For TikTok, Instagram, YouTube, Pinterest and
// Facebook posts it returns the post's caption, which the app reads the recipe from.
// Only signed-in family members can use it.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BYTES = 2_500_000;   // recipe data sits near the top of the page; big pages are cut here

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ---------- extracting the recipe ----------
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è', ntilde: 'ñ', reg: '®', trade: '™', copy: '©' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') { const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
export function cleanText(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  for (let i = 0; i < 2; i++) s = decodeEntities(s);          // some sites double-encode
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
function types(node: any): string[] {
  const t = node?.['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map((x: string) => String(x).toLowerCase());
}
function findRecipe(node: any, depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n, depth + 1); if (r) return r } return null }
  if (types(node).some(t => t === 'recipe' || t.endsWith('/recipe'))) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'hasPart']) {
    const r = findRecipe(node[key], depth + 1); if (r) return r;
  }
  return null;
}
function parseJsonLoose(text: string): any {
  const t = text.replace(/^\s*<!--|-->\s*$/g, '').replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, '').trim();
  try { return JSON.parse(t) } catch (_) {}
  try { return JSON.parse(t.replace(/[\u0000-\u001f]+/g, ' ')) } catch (_) {}     // raw newlines inside strings
  try { return JSON.parse('[' + t.replace(/}\s*{/g, '},{') + ']') } catch (_) {}   // several objects back to back
  return null;
}
function instructions(v: any, out: string[] = []): string[] {
  if (!v) return out;
  if (typeof v === 'string') { for (const line of cleanText(v).split(/\n+|(?<=\.)\s+(?=\d+\.\s)/)) { const s = line.replace(/^\s*(step\s*)?\d+[.):]\s*/i, '').trim(); if (s) out.push(s) } return out }
  if (Array.isArray(v)) { for (const x of v) instructions(x, out); return out }
  if (typeof v === 'object') {
    if (types(v).includes('howtosection') || v.itemListElement) { if (v.name && v.itemListElement) out.push(cleanText(v.name).replace(/:?$/, ':')); return instructions(v.itemListElement, out) }
    return instructions(v.text ?? v.name ?? v.description, out);
  }
  return out;
}
function firstImage(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  return v.url || v.contentUrl || v['@id'] || '';
}
function servings(v: any): number | null {
  const list = Array.isArray(v) ? v : [v];
  for (const x of list) { const m = String(x ?? '').match(/\d+(\.\d+)?/); if (m) return Math.max(1, Math.round(Number(m[0]))) }
  return null;
}
export function extractRecipe(html: string, pageUrl: string) {
  let recipe: any = null;
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const data = parseJsonLoose(m[1]);
    recipe = findRecipe(data);
    if (recipe) break;
  }
  let ingredients: string[] = [], steps: string[] = [], name = '', image = '', yieldValue: number | null = null;
  if (recipe) {
    ingredients = (recipe.recipeIngredient || recipe.ingredients || []).map(cleanText).filter(Boolean);
    steps = instructions(recipe.recipeInstructions);
    name = cleanText(recipe.name || recipe.headline);
    image = firstImage(recipe.image);
    yieldValue = servings(recipe.recipeYield ?? recipe.yield);
  }
  if (!ingredients.length) {   // older sites: microdata attributes in the HTML
    ingredients = [...html.matchAll(/itemprop\s*=\s*["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\/(?:li|span|p|div)>/gi)].map(m => cleanText(m[1])).filter(Boolean);
    if (!steps.length) steps = [...html.matchAll(/itemprop\s*=\s*["']recipeInstructions["'][^>]*>([\s\S]*?)<\/(?:li|div|ol|p)>/gi)].flatMap(m => instructions(m[1]));
  }
  if (!name) name = cleanText((html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  if (!ingredients.length) return null;
  try { if (image) image = new URL(image, pageUrl).href } catch (_) { image = '' }
  return { name: name.slice(0, 120), servings: yieldValue, ingredients: ingredients.slice(0, 80), steps: steps.slice(0, 60), image: /^https:\/\//.test(image) ? image : '', sourceUrl: pageUrl, prepTime: recipe ? String(recipe.prepTime || '') : '', cookTime: recipe ? String(recipe.cookTime || '') : '' };
}

// ---------- social posts and pages without recipe data: return the caption text ----------
// The app reads the ingredients out of the text itself (same as "Paste recipe text").
function metaContent(html: string, key: string): string {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
  return cleanText((html.match(re1) || html.match(re2) || [])[1] || '');
}
function jsonString(raw: string): string { try { return JSON.parse('"' + raw + '"') } catch (_) { return raw.replace(/\\n/g, '\n') } }
export function looksLikeRecipeText(t: string): boolean {
  const lines = t.split(/\n|(?=\s\d+\s*(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams)\b)/i);
  const amounts = lines.filter(l => /^\s*[-•▪️*]?\s*(\d|[¼½¾⅓⅔])/.test(l)).length;
  const units = (t.match(/\b\d+(?:[./]\d+)?\s*(cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|grams?|cloves?|cans?)\b/gi) || []).length;
  return /ingredients?\s*[:\n]/i.test(t) || amounts >= 3 || units >= 3;
}
function textResult(name: string, text: string, image: string, sourceUrl: string) {
  return { kind: 'text', name: cleanText(name).slice(0, 120), text: text.slice(0, 8000), image: /^https:\/\//.test(image) ? image : '', sourceUrl };
}
const UA_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/json', 'Accept-Language': 'en-US,en;q=0.9' };
async function getText(url: string, extra: Record<string, string> = {}): Promise<{ ok: boolean, url: string, text: string }> {
  if (!allowedUrl(url)) return { ok: false, url, text: '' };
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { ...UA_HEADERS, ...extra } });
    if (!allowedUrl(r.url)) return { ok: false, url: r.url, text: '' };
    return { ok: r.ok, url: r.url, text: r.ok ? await readCapped(r) : '' };
  } catch (_) { return { ok: false, url, text: '' } }
}
// A caption often links to the full recipe on a blog: prefer that page's recipe data when it has some.
async function recipeFromLinks(text: string) {
  const links = [...new Set((text.match(/https?:\/\/[^\s"'<>)]+/g) || []).map(l => l.replace(/[.,!?]+$/, '')))]
    .filter(l => !/(tiktok|instagram|facebook|fb\.watch|youtube|youtu\.be|pinterest|pin\.it|amzn|amazon|linktr\.ee|ltk\.app|shopmy|liketoknow)\./i.test(l)).slice(0, 2);
  for (const l of links) { const page = await getText(l); if (page.ok) { const r = extractRecipe(page.text, page.url); if (r) return r } }
  return null;
}
function hostOf(u: URL) { return u.hostname.toLowerCase().replace(/^(www|m|mobile|vm|vt)\./, '') }

export async function socialRecipe(u: URL): Promise<any | null> {
  const host = hostOf(u);
  // TikTok: the public oEmbed endpoint returns the caption as "title"
  if (host.endsWith('tiktok.com')) {
    let link = u.href;
    if (!/\/video\/|\/photo\//.test(u.pathname)) { const r = await getText(link); if (r.url) link = r.url }
    const o = await getText('https://www.tiktok.com/oembed?url=' + encodeURIComponent(link));
    let caption = '', image = '', author = '';
    try { const j = JSON.parse(o.text); caption = j.title || ''; image = j.thumbnail_url || ''; author = j.author_name || '' } catch (_) {}
    if (!caption) { const page = await getText(link); const m = page.text.match(/"desc":"((?:[^"\\]|\\.)*)"/); if (m) caption = jsonString(m[1]); image ||= metaContent(page.text, 'og:image') }
    if (!caption) return null;
    return (await recipeFromLinks(caption)) || textResult(caption.split('\n')[0].slice(0, 80) || (author ? author + "'s recipe" : 'TikTok recipe'), caption, image, link);
  }
  // Instagram: the public "captioned embed" page shows the whole caption without signing in
  if (host.endsWith('instagram.com')) {
    const code = u.pathname.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    if (!code) return null;
    const embed = await getText(`https://www.instagram.com/p/${code}/embed/captioned/`);
    let caption = '', image = '';
    const cap = embed.text.match(/class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i);
    if (cap) caption = cleanText(cap[1].replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, ''));
    image = (embed.text.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i) || [])[1] || '';
    if (!caption) { const page = await getText(`https://www.instagram.com/p/${code}/`); const d = metaContent(page.text, 'og:description'); const q = d.match(/:\s*["“]([\s\S]*)["”]\s*\.?$/); caption = q ? q[1] : d; image ||= metaContent(page.text, 'og:image') }
    if (!caption) return null;
    return (await recipeFromLinks(caption)) || textResult(caption.split('\n')[0].slice(0, 80) || 'Instagram recipe', caption, cleanText(image), `https://www.instagram.com/p/${code}/`);
  }
  // YouTube (videos and Shorts): the full description is in the page data
  if (host.endsWith('youtube.com') || host === 'youtu.be') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') || u.pathname.match(/\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{6,})/)?.[1]);
    if (!id) return null;
    const page = await getText('https://www.youtube.com/watch?v=' + encodeURIComponent(id), { Cookie: 'CONSENT=YES+1' });
    const m = page.text.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    const desc = m ? jsonString(m[1]) : metaContent(page.text, 'og:description');
    const title = metaContent(page.text, 'og:title') || 'YouTube recipe';
    if (!desc) return null;
    return (await recipeFromLinks(desc)) || textResult(title, title + '\n' + desc, metaContent(page.text, 'og:image'), 'https://www.youtube.com/watch?v=' + id);
  }
  // Pinterest: a pin usually points at the recipe's own website
  if (host.endsWith('pinterest.com') || host === 'pin.it' || /pinterest\./.test(host)) {
    const page = await getText(u.href);
    const own = extractRecipe(page.text, page.url); if (own) return own;
    const links = [...page.text.matchAll(/"(?:link|url|tracked_link)":"(https?:[^"]+)"/g)].map(x => jsonString(x[1])).filter(l => !/pinterest\.|pinimg\.|pin\.it/i.test(l));
    for (const l of [...new Set(links)].slice(0, 3)) { const p = await getText(l); if (p.ok) { const r = extractRecipe(p.text, p.url); if (r) return r } }
    const d = metaContent(page.text, 'og:description') || metaContent(page.text, 'description');
    return d && looksLikeRecipeText(d) ? textResult(metaContent(page.text, 'og:title'), d, metaContent(page.text, 'og:image'), page.url) : null;
  }
  // Facebook: only public posts, and only what Facebook shows without signing in
  if (host.endsWith('facebook.com') || host === 'fb.watch') {
    const page = await getText(u.href);
    const d = metaContent(page.text, 'og:description');
    if (!d) return null;
    return (await recipeFromLinks(d)) || textResult(metaContent(page.text, 'og:title') || 'Facebook recipe', d, metaContent(page.text, 'og:image'), page.url);
  }
  return undefined;   // not a social site
}

// ---------- safety checks ----------
export function allowedUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(String(raw || '').trim()) } catch (_) { return null }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)) return null;
  if (host.includes(':') && (/^(::1?|fc|fd|fe80)/i.test(host))) return null;
  return u;
}

// ---------- the web endpoint ----------
async function readCapped(res: Response): Promise<string> {
  // Read at most MAX_BYTES, then join the pieces once (cheap on Supabase's CPU limit).
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length;
    if (size >= MAX_BYTES) { reader.cancel().catch(() => {}); break }
  }
  const all = new Uint8Array(size); let at = 0;
  for (const c of chunks) { all.set(c.subarray(0, Math.min(c.length, size - at)), at); at += c.length; if (at >= size) break }
  return new TextDecoder().decode(all);
}

if (typeof Deno !== 'undefined' && Deno.serve) Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try { return await handle(req) }
  catch (e) { console.error('recipe import failed', e); return reply(500, { error: 'The import helper hit a problem with that page. Try again, or use Paste recipe text.' }) }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  // Only people signed in to this Supabase project (your family) may use the helper.
  const auth = req.headers.get('Authorization') || '';
  const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const check = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', { headers: { Authorization: auth, apikey } }).catch(() => null);
  if (!check || !check.ok) return reply(401, { error: 'Sign in under Family sync to import recipes from links.' });

  let body: any = {};
  try { body = await req.json() } catch (_) {}
  const url = allowedUrl(body.url);
  if (!url) return reply(400, { error: 'That doesn\'t look like a web address. Copy the full link starting with https://' });

  // Social posts: read the caption (TikTok, Instagram, YouTube, Pinterest, Facebook)
  const social = await socialRecipe(url).catch(() => null);
  if (social) return reply(200, social);
  if (social === null) return reply(422, { error: 'Couldn\'t read that post. It may be private, or the site didn\'t share its text. Open the post, copy the caption, and use Paste recipe text.' });

  let res: Response;
  try {
    res = await fetch(url.href, {
      redirect: 'follow', signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    });
  } catch (_) { return reply(502, { error: 'That site didn\'t respond. Try again, or use Paste recipe text.' }) }
  if (!res.ok) return reply(502, { error: `That site refused the request (${res.status}). Some sites block imports; use Paste recipe text instead.` });
  if (!allowedUrl(res.url)) return reply(400, { error: 'That link redirects somewhere that can\'t be imported.' });
  const html = await readCapped(res);

  const recipe = extractRecipe(html, res.url);
  if (!recipe) {
    // no recipe data: the page's description may still hold the recipe (blogs, forums, other apps' share pages)
    const desc = metaContent(html, 'og:description') || metaContent(html, 'description');
    if (desc && looksLikeRecipeText(desc)) return reply(200, textResult(metaContent(html, 'og:title') || '', desc, metaContent(html, 'og:image'), res.url));
    return reply(422, { error: 'No recipe found on that page. Use Paste recipe text instead.' });
  }
  return reply(200, recipe);
}
