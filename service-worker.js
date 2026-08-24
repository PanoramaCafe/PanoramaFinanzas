const CACHE_NAME="panorama-finanzas-static-v44";
const APP_SHELL=["./","./index.html","./manifest.json","./css/app.css","./js/app.js","./supabase-config.js","./xlsx-export.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const url=new URL(e.request.url);
 if(e.request.mode==="navigate"||url.pathname.endsWith("/index.html")){
   e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put("./index.html",copy));return r;}).catch(()=>caches.match("./index.html").then(r=>r||caches.match("./"))));
   return;
 }
 if(["/js/app.js","/css/app.css","/panorama-core-integration.js","/supabase-config.js","/panorama-auth.js","/xlsx-export.js","/manifest.json"].some(path=>url.pathname.endsWith(path))){
   e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
   return;
 }
 e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));
});