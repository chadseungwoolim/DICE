// Cache only this installation's application shell, never SoundCloud audio.
const BASE=new URL('./',self.location.href);
const PREFIX='orbit-'+BASE.pathname+'-';
const CACHE=PREFIX+'portable-v1';
const local=path=>new URL(path,BASE).href;
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll([local('./'),local('icon.svg'),local('manifest.webmanifest')])));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==BASE.origin||!u.pathname.startsWith(BASE.pathname))return;
 if(e.request.mode==='navigate'&&(u.href===local('./')||u.href===local('index.html'))){
  e.respondWith(fetch(e.request).catch(async()=>await caches.match(local('./'))||Response.error()));return;
 }
 if(u.pathname.startsWith(BASE.pathname+'assets/'))e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request);if(hit)return hit;const response=await fetch(e.request);if(response.ok)await c.put(e.request,response.clone());return response}));
});
