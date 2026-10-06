const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
const source=root;
const origin='https://example.test',base=origin+'/library/';
const marker=base+'offline-complete';
const prefix='shadow-library-book-v1-';
const read=path=>fs.readFileSync(root+'/'+path,'utf8');
const books=JSON.parse(read('library/data/books.json'));
books[0].commerce={...books[0].commerce,mode:'pilot',sampleChapter:'chapter-01'};
function cacheStore(){
 const data=new Map(),deleted=[];
 return {data,deleted,keys:async()=>[...data.keys()],delete:async name=>{deleted.push(name);return data.delete(name)},open:async name=>{
  if(!data.has(name))data.set(name,new Map());const entries=data.get(name);
  const url=req=>typeof req==='string'?req:req.url;
  return {put:async(req,res)=>entries.set(url(req),res.clone()),match:async req=>entries.get(url(req))?.clone(),keys:async()=>[...entries.keys()].map(url=>({url})),addAll:async()=>{}};
 }};
}
async function seed(store,name,urls,data={id:'slow-down',urls,bytes:1,savedAt:1}){
 const cache=await store.open(name);
 for(const url of urls)await cache.put(url,new Response('cached:'+url));
 if(data)await cache.put(marker,new Response(JSON.stringify(data)));
}
function offline(store=cacheStore()){
 const fetched=[],local=new Map();
 const c={URL,Response,Request,AbortController,Event,console,setTimeout,clearTimeout,books,caches:store,
 location:new URL(base),navigator:{onLine:true,storage:{persist:async()=>true}},
 localStorage:{getItem:key=>local.get(key),setItem:(key,value)=>local.set(key,value)},
 matchMedia:()=>({matches:false}),window:{addEventListener:()=>{}},document:{querySelector:()=>null,querySelectorAll:()=>[]},
 fetch:async url=>{fetched.push(url);const path=new URL(url).pathname;return new Response(path.endsWith('.json')?(fs.existsSync(source+path)?fs.readFileSync(source+path,'utf8'):JSON.stringify({blocks:[]})):'asset',{status:200})}}
 vm.createContext(c);
 vm.runInContext(read('library/src/components.js').replaceAll('export ',''),c);
 vm.runInContext(read('library/src/offline.js').replace(/^import .*;$/m,'const e=escapeHTML;').replaceAll('export ','').replaceAll('import.meta.url',JSON.stringify(base+'src/offline.js?v=pilot-20261007-1')),c);
 vm.runInContext('catalogue=books',c);
 return {c,store,fetched,run:code=>vm.runInContext(code,c)};
}
function worker(store=cacheStore()){
 const events={},fetched=[];
 const c={URL,Response,Request,caches:store,self:{registration:{scope:base},location:{origin},clients:{claim:async()=>{}},addEventListener:(name,handler)=>events[name]=handler},fetch:async request=>{fetched.push(request.url);return new Response('network')}};
 vm.createContext(c);vm.runInContext(read('library/sw.js'),c);
 return {events,store,fetched,request:async (url,download=false)=>{let reply;events.fetch({request:new Request(new URL(url,base),{headers:download?{'X-Library-Download':'1'}:{}}),respondWith:p=>reply=p});return reply===undefined?null:await reply;}};
}
test('pilot download fetches only canonical first chapter, four sample images and cover',async()=>{
 const {run,store,fetched}=offline();await run('download(books[0])');
 assert.equal(fetched.filter(url=>new URL(url).pathname.endsWith('.json')).length,1);
 assert.equal(fetched.find(url=>url.endsWith('.json')),base+'data/chapters/slow-down-full/chapter-01.json');
 assert.equal(fetched.length,6);
 const names=await store.keys();assert.equal(names.length,1);
 const saved=await (await store.open(names[0])).match(marker);const record=await saved.json();
 assert.equal(record.accessVersion,'pilot-20261007-1');assert.equal(record.scope,'sample');assert.deepEqual(record.chapterIds,['chapter-01']);
 assert.equal(run('isDownloaded("slow-down")'),true);
 assert.match(run('controls(books[0])'),/删除第一章离线副本/);
 assert.equal(store.deleted.length,0);
});
test('old full pilot markers are not advertised and are retained; other complete markers still work',async()=>{
 const store=cacheStore(),pilot=base+books[0].chapters[0].file,other=base+books[1].chapters[0].file;
 await seed(store,prefix+'slow-down-old',[pilot]);
 await seed(store,prefix+'slow-shutter-old',[other],{id:'slow-shutter',urls:[other],bytes:2});
 await seed(store,prefix+'slow-down-1000000000000-abandoned',[pilot],null);
 const {run}=offline(store);await run('scan()');
 assert.equal(run('isDownloaded("slow-down")'),false);assert.equal(run('isDownloaded("slow-shutter")'),true);
 assert.equal((await store.keys()).length,3);assert.equal(store.deleted.length,0);
});
test('invalid or mismatched pilot sample markers never count as downloaded',async()=>{
 const sample=base+'data/chapters/slow-down-full/chapter-01.json',locked=base+'data/chapters/slow-down-full/chapter-02.json';
 for(const change of [{accessVersion:'old'},{scope:'full'},{chapterIds:['chapter-02']},{urls:[sample,locked]},{urls:[]}]){
  const store=cacheStore();const record={id:'slow-down',scope:'sample',accessVersion:'pilot-20261007-1',chapterIds:['chapter-01'],urls:[sample],bytes:1,...change};
  await seed(store,prefix+'slow-down-invalid',record.urls,record);
  const {run}=offline(store);await run('scan()');assert.equal(run('isDownloaded("slow-down")'),false);
  assert.equal(store.deleted.length,0);
 }
});
test('other books retain all accessible chapters and download labels',async()=>{
 for(let i=1;i<books.length;i++){
  const {run,fetched}=offline();await run(`download(books[${i}])`);
  assert.deepEqual(fetched.filter(url=>new URL(url).pathname.endsWith('.json')),(books[i].chapters||[]).map(chapter=>base+chapter.file));
  assert.equal(run(`accessibleChapters(books[${i}]).length`),(books[i].chapters||[]).length);
  assert.doesNotMatch(run(`controls(books[${i}])`),/第一章/);
 }
});
test('SW returns 403 before network, shell, old full caches or explicit download bypass',async()=>{
 const store=cacheStore();const paths=[...books[0].chapters.filter(c=>c.id!=='chapter-01').map(c=>c.file),
 'data/chapters/preface.json','data/chapters/author-note.json','data/chapters/chapter-01.json','data/chapters/slow-down/chapter-02.json',
 'data/chapters/slow-down-full/chapter-%30%32.json?x=1','assets/books/slow-down-docx/photo-03-reading.jpg','assets/books/slow-down/BussellTownWA1_3.jpg'];
 await seed(store,prefix+'slow-down-old-full',paths.map(path=>base+path));
 await seed(store,'shadow-library-shell-pilot-20261007-1',paths.map(path=>base+path),null);
 const sw=worker(store);
 for(const path of paths)for(const download of [false,true])assert.equal((await sw.request(path,download)).status,403,path);
 assert.equal(sw.fetched.length,0);assert.equal(store.deleted.length,0);
});
test('SW allows sample and other books from old complete caches, but ignores incomplete downloads',async()=>{
 const store=cacheStore(),sample='data/chapters/slow-down-full/chapter-01.json';
 const paths=[sample,'assets/books/slow-down-docx/photo-02-large.jpg',...books.slice(1).filter(b=>b.chapters?.length).map(b=>b.chapters[0].file)];
 await seed(store,prefix+'old-complete',paths.map(path=>base+path));
 const sw=worker(store);for(const path of paths)assert.equal(await (await sw.request(path)).text(),'cached:'+base+path);
 assert.equal(sw.fetched.length,0);assert.equal(await sw.request(sample,true),null);
 const incomplete='assets/books/structure-pages/some-new-image.jpg';await seed(store,prefix+'incomplete',[base+incomplete],null);
 assert.equal(await (await sw.request(incomplete)).text(),'network');assert.deepEqual(sw.fetched,[base+incomplete]);
});
test('activation preserves every book cache while retiring only obsolete shells',async()=>{
 const store=cacheStore();await seed(store,prefix+'slow-down-full',[]);await store.open('shadow-library-shell-old');await store.open('shadow-library-shell-pilot-20261007-1');
 const sw=worker(store);let wait;sw.events.activate({waitUntil:p=>wait=p});await wait;
 assert.equal(store.data.has(prefix+'slow-down-full'),true);assert.deepEqual(store.deleted,['shadow-library-shell-old']);
});
test('removing the current pilot sample preserves previous full-book and incomplete archives',async()=>{
 const store=cacheStore(),locked=base+'data/chapters/slow-down-full/chapter-02.json';
 await seed(store,prefix+'slow-down-old-full',[locked]);
 await seed(store,prefix+'slow-down-old-incomplete',[locked],null);
 const {run}=offline(store);await run('download(books[0])');assert.equal(run('isDownloaded("slow-down")'),true);
 await run('removeDownload(books[0])');assert.equal(run('isDownloaded("slow-down")'),false);
 assert.deepEqual(await store.keys(),[prefix+'slow-down-old-full',prefix+'slow-down-old-incomplete']);
 assert.equal(store.deleted.length,1);assert.equal(run('isSaved("slow-down")'),true);
});
