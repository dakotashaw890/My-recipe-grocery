// My Recipe & Grocery: recipe import helper (Supabase Edge Function "recipe-import").
// Paste this whole file into Supabase → Edge Functions → Deploy a new function → Via Editor.
// It fetches a recipe web page and returns the recipe that most recipe sites publish
// inside the page (schema.org "Recipe" data). Only signed-in family members can use it.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BYTES = 4_000_000;

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
  return { name: name.slice(0, 120), servings: yieldValue, ingredients: ingredients.slice(0, 80), steps: steps.slice(0, 60), image: /^https:\/\//.test(image) ? image : '', sourceUrl: pageUrl };
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
if (typeof Deno !== 'undefined' && Deno.serve) Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
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

  let res: Response;
  try {
    res = await fetch(url.href, {
      redirect: 'follow', signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    });
  } catch (_) { return reply(502, { error: 'That site didn\'t respond. Try again, or use Paste recipe text.' }) }
  if (!res.ok) return reply(502, { error: `That site refused the request (${res.status}). Some sites block imports; use Paste recipe text instead.` });
  if (!allowedUrl(res.url)) return reply(400, { error: 'That link redirects somewhere that can\'t be imported.' });
  const reader = res.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { reader.cancel(); break } chunks.push(value) }
  const html = new TextDecoder().decode(chunks.reduce((a, c) => { const n = new Uint8Array(a.length + c.length); n.set(a); n.set(c, a.length); return n }, new Uint8Array()));

  const recipe = extractRecipe(html, res.url);
  if (!recipe) return reply(422, { error: 'No recipe found on that page. Use Paste recipe text instead.' });
  return reply(200, recipe);
});
