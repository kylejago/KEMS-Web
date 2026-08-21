const CACHE_NAME = "kems-alpha7-web27-shell-v1";
const APP_SHELL = [
  "/","/index.html","/agile.html","/compare.html","/performance.html","/settings.html","/remote-access.html",
  "/styles.css?v=alpha7web27","/brand.css?v=alpha7web27","/agile.css?v=alpha7web27","/compare.css?v=alpha7web27","/web21.css?v=alpha7web27","/web26.css?v=alpha7web27",
  "/live-page.js?v=alpha7web27","/agile-page.js?v=alpha7web27","/web21-agile.js?v=alpha7web27","/compare-page.js?v=alpha7web27","/product-model.js?v=alpha7web27","/performance-page.js?v=alpha7web27","/settings-page.js?v=alpha7web27",
  "/panel-face-mask.png?v=alpha7web27","/brand-lockup.svg?v=alpha7web27","/logo.svg?v=alpha7web27"
];
self.addEventListener("install",(event)=>{event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",(event)=>{event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith("kems-")&&key!==CACHE_NAME).map((key)=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",(event)=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(url.pathname.startsWith("/api/")||url.pathname==="/site.webmanifest"){event.respondWith(fetch(request));return}if(request.mode==="navigate"){event.respondWith(fetch(request).then((response)=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then((cache)=>cache.put(url.pathname,copy))}return response}).catch(async()=>await caches.match(url.pathname)||caches.match("/")));return}event.respondWith(caches.match(request).then((cached)=>cached||fetch(request).then((response)=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then((cache)=>cache.put(request,copy))}return response}))) });
