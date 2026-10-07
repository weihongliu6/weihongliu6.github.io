const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const base='https://example.test/library/',build='private-20261007-1',shell='shadow-library-shell-'+build;
function harness({fail=false,stale=false}={}){
 const data=new Map(),events={},deleted=[],network=[];let skip=0,claimed=0;
 const key=r=>typeof r==='string'?r:r.url;
 const caches={keys:async()=>[...data.keys()],delete:async n=>{deleted.push(n);return data.delete(n)},open:async n=>{
  if(!data.has(n))data.set(n,new Map());const entries=data.get(n);
  return {keys:async()=>[...entries.keys()].map(url=>({url})),delete:async r=>entries.delete(key(r)),put:async(r,s)=>entries.set(key(r),s.clone()),match:async r=>entries.get(key(r))?.clone(),addAll:async requests=>{
   if(fail)throw Error('offline');
   for(const request of requests){const pathname=new URL(request.url).pathname;
    entries.set(request.url,new Response(pathname.endsWith('/')||pathname.endsWith('/index.html')?(stale?'old html':read('library/index.html')):'new:'+request.url));}
  }};
 }};
 const ctx={URL,Request,Response,caches,self:{registration:{scope:base},location:{origin:new URL(base).origin},skipWaiting:async()=>{skip++},clients:{claim:async()=>{claimed++}},addEventListener:(n,f)=>events[n]=f},fetch:async request=>{network.push(request.url);return new Response('network')}};
 vm.runInNewContext(read('library/sw.js'),ctx);
 const fire=async name=>{let promise;events[name]({waitUntil:p=>promise=p});await promise;};
 const request=async(path,{navigate=false,download=false}={})=>{let promise,wait;const req=new Request(new URL(path,base),{headers:download?{'X-Library-Download':'1'}:{}});events.fetch({request:navigate?{url:req.url,method:'GET',mode:'navigate',headers:req.headers}:req,respondWith:p=>promise=p,waitUntil:p=>wait=p});const response=await promise;await wait;return response;};
 return {data,caches,deleted,network,events,fire,request,get skipped(){return skip},get claimed(){return claimed}};
}
test('complete validated precache activates without closing old tabs, retaining unrelated cache bytes',async()=>{
 const h=harness();for(const name of ['shadow-library-shell-pwa-20261006-1','shadow-library-book-v1-old-full','other-app-cache']){const cache=await h.caches.open(name);await cache.put(base+'sentinel',new Response(name));}
 await h.fire('install');assert.equal(h.skipped,1);await h.fire('activate');assert.equal(h.claimed,1);assert.deepEqual(h.deleted,[]);
 for(const name of ['shadow-library-shell-pwa-20261006-1','shadow-library-book-v1-old-full','other-app-cache'])assert.equal(await (await (await h.caches.open(name)).match(base+'sentinel')).text(),name);
 assert.match(await (await h.request('./',{navigate:true})).text(),/library-build" content="private-20261007-1/);
 assert.match(await (await h.request('index.html?reopen=1',{navigate:true})).text(),/library-build" content="private-20261007-1/);
});
test('failed precache or stale CDN HTML never skips waiting, deletes only new incomplete shell',async()=>{
 for(const opts of [{fail:true},{stale:true}]){const h=harness(opts);await h.caches.open('shadow-library-shell-old');await h.caches.open('shadow-library-book-v1-kept');await assert.rejects(h.fire('install'));assert.equal(h.skipped,0);assert.deepEqual(h.deleted,[shell]);assert.ok(h.data.has('shadow-library-shell-old'));assert.ok(h.data.has('shadow-library-book-v1-kept'));}
});
test('two open generations retain exact versioned lazy modules, absent old versions never receive new bytes',async()=>{
 const h=harness();for(const [name,v] of [['shadow-library-shell-old','renaissance-20261006'],['shadow-library-shell-pilot-20261007-1','pilot-20261007-1']]){const cache=await h.caches.open(name);await cache.put(base+'src/listen.js?v='+v,new Response(v));}
 await h.fire('install');await h.fire('activate');
 assert.equal(await (await h.request('src/listen.js?v=renaissance-20261006')).text(),'renaissance-20261006');
 assert.equal(await (await h.request('src/listen.js?v=pilot-20261007-1')).text(),'new:'+base+'src/listen.js?v=pilot-20261007-1');
 assert.equal((await h.request('src/listen.js?v=unknown')).status,409);assert.equal((await h.request('src/listen.js')).status,409);assert.equal(h.network.length,0);
});
test('locked pilot payloads denied before historical caches, downloads and network',async()=>{
 const h=harness();const path='data/chapters/slow-down-full/chapter-02.json';for(const name of ['shadow-library-shell-old','shadow-library-book-v1-old']){await (await h.caches.open(name)).put(base+path,new Response('private-in-old-cache'));}
 for(const download of [false,true])assert.equal((await h.request(path,{download})).status,403);
 assert.equal(h.network.length,0);assert.deepEqual(h.deleted,[]);
});
test('build handshake identifies active code; recovery requires exact activated build and never clears data or auto reloads',()=>{
 const h=harness();let reply;h.events.message({data:{type:'LIBRARY_BUILD'},ports:[{postMessage:r=>reply=r}]});assert.equal(reply.build,build);
 const recovery=read('library-update.html'),update=read('library/src/update.js');
 assert.match(recovery,/active\?\.state==='activated'&&await workerBuild\(active\)===EXPECTED_BUILD/);
 assert.match(recovery,/await retirePilotCaches\(registration.active\)/);
 assert.match(recovery,/event.data.complete===true/);
 assert.match(recovery,/await registration.update\(\)/);assert.match(recovery,/back.hidden=false/);
 for(const source of [recovery,update,read('library/sw.js')])assert.doesNotMatch(source,/location\.reload|location\.replace|localStorage\.(clear|removeItem)|indexedDB\.deleteDatabase|\.unregister\(/);
 assert.match(recovery,/href="\/library\/#\/book\/slow-down"/);
});
test('release document and new updater are precached, unchanged pilot module graph remains aligned',()=>{
 const sw=read('library/sw.js');assert.match(read('library/index.html'),/src\/update.js\?v=private-20261007-1/);assert.ok(sw.includes('src/update.js?v='+build));
 for(const file of ['app','offline','reader','listen'])for(const [,asset] of read('library/src/'+file+'.js').matchAll(/from '\.\/([^']+)'/g))assert.ok(sw.includes('src/'+asset));
});
