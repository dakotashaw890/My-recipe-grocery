const CACHE='recipe-grocery-v15c-flat';
const CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./sync-config.js?v=15','./storage.js?v=15','./sync.js?v=15','./extras.js?v=15','./app.css?v=15'];
const IMAGES=[];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(async c=>{
  await c.addAll(CORE);
  // Images are cached individually so one missing file never blocks the update.
  await Promise.all(IMAGES.map(u=>c.add(u).catch(()=>{})));
}))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin)return;   // Supabase and other sites: straight to the network
  // Use the fresh page when GitHub serves it; if GitHub is down or returns an error page (like a 404), open the saved copy.
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>r.ok?r:caches.match('./index.html').then(c=>c||r)).catch(()=>caches.match('./index.html')));return}
  // Sync settings can be edited on GitHub at any time, so prefer the fresh copy.
  if(url.pathname.endsWith('/sync-config.js')){e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
