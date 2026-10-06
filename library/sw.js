/* Only /library/ is controlled. Completed downloads survive application updates. */
const SHELL='shadow-library-shell-pwa-20261006-1';
const BOOK_PREFIX='shadow-library-book-v1-';
const base=self.registration.scope;
const marker=new URL('offline-complete',base).href;
const SHELL_FILES=[
 './','index.html','manifest.webmanifest','assets/favicon.svg','assets/app-icon-192.png','assets/app-icon-512.png',
 'src/app.js?v=pwa-20261006','src/offline.js?v=pwa-20261006','src/styles.css?v=pwa-20261006',
 'src/components.js?v=renaissance-20261006','src/reader.js?v=renaissance-20261006',
 'src/listen.js?v=renaissance-20261006','src/storage.js?v=phase2-20260925',
 'data/books.json?v=renaissance-20261006','data/platform.json?v=1',
 'assets/covers/slow-down.jpg','assets/books/slow-shutter-epub/cover.png',
 'assets/books/structure-pages/image-00-reading.jpg','assets/covers/metabolism.jpg','assets/covers/renaissance.jpg'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 try{await cache.addAll(SHELL_FILES.map(path=>new Request(new URL(path,base),{cache:'reload'})));}
 catch(error){await caches.delete(SHELL);throw error;}
 // Updates wait for existing tabs to close, keeping their module versions consistent.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('shadow-library-shell-')&&name!==SHELL)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request, url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(base))return;
 // Explicit downloads always reach the network; incomplete caches are never served.
 if(request.headers.get('X-Library-Download')==='1')return;
 event.respondWith((async()=>{
  const shell=await caches.open(SHELL);
  if(request.mode==='navigate' && (url.pathname===new URL(base).pathname||url.pathname===new URL('index.html',base).pathname))return (await shell.match(base))||fetch(request);
  const cached=await shell.match(request);if(cached)return cached;
  for(const name of await caches.keys()){
   if(!name.startsWith(BOOK_PREFIX))continue;
   const cache=await caches.open(name);
   if(await cache.match(marker)){const hit=await cache.match(request);if(hit)return hit;}
  }
  return fetch(request);
 })());
});
