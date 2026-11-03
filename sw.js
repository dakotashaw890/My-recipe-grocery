const CACHE='gingham-v42';
const CORE=['./','./index.html','./manifest.json?v=17b','./icon-192.png','./icon-512.png','./badge-96.png','./ui.js?v=24','./units.js?v=38','./groups.js?v=25','./planner.js?v=27','./family.js?v=24','./cooking.js?v=40','./shop.js?v=32','./starter-recipes.js?v=39','./week.js?v=37','./core.js?v=39','./shop-extras.js?v=35','./onboarding.js?v=39','./sharing.js?v=39','./ingredient-catalog.js?v=39','./catalog.js?v=39','./sync-config.js?v=17','./storage.js?v=39','./sync.js?v=41','./extras.js?v=39','./kitchen.js?v=39','./pictures.js?v=24','./imports.js?v=39','./weights.js?v=39','./report.js?v=39','./handsfree.js?v=39','./reminders.js?v=39','./prices.js?v=25','./nutrition.js?v=37','./community.js?v=39','./setup-check.js?v=39','./import-apps.js?v=39','./substitutions.js?v=27','./account.js?v=39','./app.css?v=40','./ingredient-pictures.js?v=24','./cropper.min.js?v=1.6.2','./cropper.min.css?v=1.6.2'];
const IMAGES=[];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(async c=>{
  await c.addAll(CORE);
  // Images are cached individually so one missing file never blocks the update.
  await Promise.all(IMAGES.map(u=>c.add(u).catch(()=>{})));
}))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!=='gingham-share').map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{
  // Share → Whole Kitchen (links, text and pictures) arrives as a form post; keep any pictures, then open the app with the rest
  if(e.request.method==='POST'&&new URL(e.request.url).pathname.endsWith('/share-target')){e.respondWith((async()=>{
    const fd=await e.request.formData(),q=new URLSearchParams(),c=await caches.open('gingham-share');
    for(const k of await c.keys())await c.delete(k);
    let n=0;for(const f of fd.getAll('share_image')){if(f&&f.size&&/^image\//.test(f.type)&&n<4)await c.put('./shared-image-'+(n++),new Response(f,{headers:{'Content-Type':f.type}}))}
    for(const k of ['share_title','share_text','share_url']){const v=fd.get(k);if(v)q.set(k,v)}
    if(n)q.set('shared_images',String(n));
    return Response.redirect(new URL('./index.html?'+q.toString(),self.registration.scope).href,303);
  })());return}
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin)return;   // Supabase and other sites: straight to the network
  // Use the fresh page when GitHub serves it; if GitHub is down or returns an error page (like a 404), open the saved copy.
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>r.ok?r:caches.match('./index.html').then(c=>c||r)).catch(()=>caches.match('./index.html')));return}
  // Sync settings can be edited on GitHub at any time, so prefer the fresh copy.
  if(url.pathname.endsWith('/sync-config.js')){e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
// Prep reminders (v38): the family's Supabase helper sends them; show them, and open Whole Kitchen when tapped
self.addEventListener('push',e=>{
  let m={};try{m=e.data?e.data.json():{}}catch(_){m={title:'Whole Kitchen',body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(m.title||'Whole Kitchen',{body:m.body||'',tag:m.tag||'gingham',icon:'icon-192.png',badge:'badge-96.png',data:{url:m.url||'./index.html'},renotify:!!m.tag}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const target=new URL(e.notification.data?.url||'./index.html',self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list)if(c.url.startsWith(self.registration.scope)&&'focus' in c){c.postMessage({type:'reminder-open'});return c.focus()}
    return self.clients.openWindow(target);
  }));
});
