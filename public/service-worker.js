const CACHE_NAME = "kems-alpha7-web22-shell-v1";
const APP_SHELL = [
  "/","/index.html","/agile.html","/compare.html","/performance.html","/settings.html","/remote-access.html",
  "/styles.css?v=alpha7web22","/brand.css?v=alpha7web22","/agile.css?v=alpha7web22","/compare.css?v=alpha7web22","/web21.css?v=alpha7web22",
  "/app.js?v=alpha7web22","/platform-label.js?v=alpha7web22","/agile-page.js?v=alpha7web22","/web21-agile.js?v=alpha7web22","/compare-page.js?v=alpha7web22","/strategy-comparison.js?v=alpha7web22","/product-model.js?v=alpha7web22","/web21-live.js?v=alpha7web22","/performance-page.js?v=alpha7web22","/settings-page.js?v=alpha7web22",
  "/brand-lockup.svg?v=alpha7web22","/logo.svg?v=alpha7web22"
];
self.addEventListener("install",(event)=>{event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",(event)=>{event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith("kems-")&&key!==CACHE_NAME).map((key)=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",(event)=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(url.pathname.startsWith("/api/")||url.pathname==="/site.webmanifest"){event.respondWith(fetch(request));return}if(request.mode==="navigate"){event.respondWith(fetch(request).then((response)=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then((cache)=>cache.put(url.pathname,copy))}return response}).catch(async()=>await caches.match(url.pathname)||caches.match("/")));return}event.respondWith(caches.match(request).then((cached)=>cached||fetch(request).then((response)=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then((cache)=>cache.put(request,copy))}return response}))) });
