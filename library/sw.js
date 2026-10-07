/* Only /library/ is controlled. Completed downloads survive application updates.
 * This pilot guard is a reading-flow boundary, not protection of public source files.
 * Raw files remain public when accessed outside this service worker. */
const BUILD='update-20261007-1';
const SHELL='shadow-library-shell-'+BUILD;
const BOOK_PREFIX='shadow-library-book-v1-';
const base=self.registration.scope;
const marker=new URL('offline-complete',base).href;
const samplePath='data/chapters/slow-down-full/chapter-01.json';
const sampleAssets=new Set([
 'assets/books/slow-down-docx/photo-01-reading.jpg','assets/books/slow-down-docx/photo-01-large.jpg',
 'assets/books/slow-down-docx/photo-02-reading.jpg','assets/books/slow-down-docx/photo-02-large.jpg'
]);
// Verified against the pilot's canonical chapter and the repository snapshot.
// Keep this allowlist and the cache version in step with pilot content changes.
function lockedPilotPath(url){
 let path;
 try{path=decodeURIComponent(url.pathname).slice(new URL(base).pathname.length);}
 catch{return true;}
 if(path.startsWith('data/chapters/slow-down-full/'))return path!==samplePath;
 if(path.startsWith('data/chapters/slow-down/'))return true;
 if(['data/chapters/preface.json','data/chapters/author-note.json','data/chapters/chapter-01.json'].includes(path))return true;
 if(path.startsWith('assets/books/slow-down-docx/'))return !sampleAssets.has(path);
 if(path.startsWith('assets/books/slow-down/'))return true;
 return false;
}
const SHELL_FILES=[
 './','index.html','src/update.js?v=update-20261007-1','manifest.webmanifest','assets/favicon.svg','assets/app-icon-192.png','assets/app-icon-512.png',
 'src/app.js?v=pilot-20261007-1','src/offline.js?v=pilot-20261007-1','src/styles.css?v=pilot-20261007-1',
 'src/components.js?v=pilot-20261007-1','src/reader.js?v=pilot-20261007-1',
 'src/listen.js?v=pilot-20261007-1','src/storage.js?v=phase2-20260925',
 'data/books.json?v=pilot-20261007-1','data/platform.json?v=1',
 'assets/covers/slow-down.jpg','assets/books/slow-shutter-epub/cover.png',
 'assets/books/structure-pages/image-00-reading.jpg','assets/covers/metabolism.jpg','assets/covers/renaissance.jpg'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 try{
  await cache.addAll(SHELL_FILES.map(path=>new Request(new URL(path,base),{cache:'reload'})));
  // Reject a stale CDN document rather than activating a mixed release.
  for(const path of ['./','index.html']){
   const response=await cache.match(new URL(path,base).href);
   if(!response || !(await response.text()).includes('name="library-build" content="'+BUILD+'"'))throw Error('Incomplete application release');
  }
 }
 catch(error){await caches.delete(SHELL);throw error;}
 // Only a fully installed shell may replace the old worker. Existing pages are not reloaded.
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // Retain exact historical module URLs for open old tabs, and every user book cache.
 // Do not garbage-collect during this migration: a sleeping tab may still need its graph.
 // Book caches are deliberately retained, including older full-book downloads.
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='LIBRARY_BUILD')event.ports?.[0]?.postMessage({type:'LIBRARY_BUILD',build:BUILD});
});
self.addEventListener('fetch',event=>{
 const request=event.request, url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(base))return;
 // Reject locked payloads before every cache and network path, including downloads.
 if(lockedPilotPath(url)){
  event.respondWith(Promise.resolve(new Response(JSON.stringify({error:'pilot_sample_only',message:'试售阶段仅开放第一章。'}),{
   status:403,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
  })));
  return;
 }
 // Explicit allowed downloads reach the network; incomplete caches are never served.
 if(request.headers.get('X-Library-Download')==='1')return;
 event.respondWith((async()=>{
  const shell=await caches.open(SHELL);
  if(request.mode==='navigate' && (url.pathname===new URL(base).pathname||url.pathname===new URL('index.html',base).pathname))return (await shell.match(base))||fetch(request);
  const cached=await shell.match(request);if(cached)return cached;
  // Legacy module graphs must use their exact cached versions, never today's file
  // under yesterday's query key. This also covers lazy imports in old open tabs.
  if(url.pathname.startsWith(new URL('src/',base).pathname)){
   for(const name of await caches.keys()){
    if(!name.startsWith('shadow-library-shell-')||name===SHELL)continue;
    const hit=await (await caches.open(name)).match(request);if(hit)return hit;
   }
   return new Response('This application version is unavailable. Open /library-update.html to update safely.',{status:409,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
  for(const name of await caches.keys()){
   if(!name.startsWith(BOOK_PREFIX))continue;
   const cache=await caches.open(name);
   if(await cache.match(marker)){const hit=await cache.match(request);if(hit)return hit;}
  }
  return fetch(request);
 })());
});
