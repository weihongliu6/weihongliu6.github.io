/* Navigation bridge only. Do not read, remove, or migrate old caches or reader data.
 * Existing old GH workers serve a cached index until their normal update completes.
 * This replacement bypasses that cached shell on the next navigation. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==scope.origin)return;
 const paths=new Set([scope.pathname.replace(/\/$/,''),scope.pathname,new URL('index.html',scope).pathname]);
 if(!paths.has(url.pathname))return;
 event.respondWith(fetch(new Request(new URL('index.html',scope),{cache:'no-store',credentials:'omit'})).catch(()=>new Response(
  '<!doctype html><meta charset="utf-8"><title>影子观察数字书房</title><p>请联网后进入正式书房：<a href="https://library.shadowobserverbooks.com/library/">影子观察数字书房</a>。原阅读记录仍保留在此浏览器。</p>',
  {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
