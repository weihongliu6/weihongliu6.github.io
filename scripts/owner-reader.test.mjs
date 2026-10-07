import test from 'node:test';
import assert from 'node:assert/strict';
import {ProtectedReader,AccessError,checkedCatalog,imageId,PROGRESS_KEY,readProgress,saveProgress,resetProgress} from '../reader-test/core.mjs';
const config={projectUrl:'https://auth.test',endpoint:'https://read.test',publicKey:'public',ownerId:'owner',ownerEmail:'owner@example.test',redirect:'https://site.test/reader-test/',loginEnabled:true};
const catalog=()=>({bookId:'slow-down',sections:Array.from({length:22},(_,n)=>({id:`chapter-${String(n+1).padStart(2,'0')}`,assetId:`chapter-${String(n+1).padStart(2,'0')}.json`,title:`Section ${n+1}`})),images:Array.from({length:49},(_,n)=>({assetId:`photo-${n}.jpg`,sourceRef:`assets/books/slow-down/photo-${n}.jpg`}))});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function fixture(custom){const calls=[],revoked=[];const r=new ProtectedReader(config,{fetcher:async(url,options)=>{calls.push({url,options});if(custom){const res=await custom(url,options);if(res)return res;}if(url.endsWith('/user'))return json({id:'owner',email:config.ownerEmail});if(url.endsWith('/catalog'))return json(catalog());if(url.endsWith('.jpg'))return new Response('jpeg',{headers:{'Content-Type':'image/jpeg'}});return json({id:'chapter-01',blocks:[]});},urls:{createObjectURL:()=>`blob:${Math.random()}`,revokeObjectURL:url=>revoked.push(url)}});return {r,calls,revoked};}
test('local grant flags confer no access; missing JWT does not fetch',async()=>{const {r,calls}=fixture();r.granted=true;await assert.rejects(r.validate(),e=>e.status===401);assert.equal(calls.length,0);});
test('expired JWT clears volatile data without a request',async()=>{const {r,calls}=fixture();r.setSession('expired',10);r.expiry=0;await assert.rejects(r.validate(),e=>e.status===401);assert.equal(r.token,null);assert.equal(calls.length,0);});
test('server denied JWT and missing identity are rejected',async()=>{for(const response of [json({},401),json({})]){const {r}=fixture(url=>url.endsWith('/user')?response:null);r.setSession('forged',30);await assert.rejects(r.validate());assert.equal(r.token,null);}});
test('catalog full grant and exact ref mapping only',()=>{const c=checkedCatalog(catalog());assert.equal(c.sections.length,22);assert.equal(imageId(c,c.images[0].sourceRef),'photo-0.jpg');for(const s of ['https://evil.test/a.jpg','../photo-0.jpg','assets/books/slow-down/photo-0.jpg?x=1'])assert.throws(()=>imageId(c,s));assert.throws(()=>checkedCatalog({...c,sections:c.sections.slice(0,1)}));});
test('all requests use no-store, bearer headers and no fallback',async()=>{const {r,calls}=fixture();r.setSession('jwt',30);const {epoch}=await r.chapter('chapter-01.json');await r.image(catalog().images[0].sourceRef,epoch);assert.equal(calls.length,4);for(const {url,options} of calls){assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer jwt');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.ok(url.startsWith('https://auth.test/')||url.startsWith('https://read.test/'));assert.ok(!url.includes('jwt'));}r.lock();});
test('revokes blobs and clears on subsequent denied request',async()=>{let denied=false;const {r,revoked}=fixture(url=>denied&&url.endsWith('/catalog')?json({},404):null);r.setSession('jwt',30);const {epoch}=await r.chapter('chapter-01.json');await r.image(catalog().images[0].sourceRef,epoch);denied=true;await assert.rejects(r.validate());assert.equal(r.token,null);assert.equal(revoked.length,1);assert.equal(r.blobs.size,0);});
test('canceled async navigation cannot resurrect a chapter',async()=>{let release;const {r}=fixture(url=>url.endsWith('/asset/chapter-01.json')?new Promise(resolve=>release=()=>resolve(json({id:'chapter-01',blocks:[]}))):null);r.setSession('jwt',30);const pending=r.chapter('chapter-01.json');while(!release)await new Promise(resolve=>setTimeout(resolve,1));r.clearContent();release();await assert.rejects(pending,e=>e.name==='AbortError');r.lock();});
test('late image response never creates a blob after logout',async()=>{let release;const {r}=fixture(url=>url.endsWith('.jpg')?new Promise(resolve=>release=()=>resolve(new Response('jpeg',{headers:{'Content-Type':'image/jpeg'}}))):null);r.setSession('jwt',30);const {epoch}=await r.chapter('chapter-01.json');const p=r.image(catalog().images[0].sourceRef,epoch);r.lock();release();await assert.rejects(p,e=>e.name==='AbortError');assert.equal(r.blobs.size,0);});
test('progress namespace preserves public reader; no content/session fields',()=>{const m=new Map([['library-progress','public']]);const storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};saveProgress(storage,'chapter-01.json',.4);assert.deepEqual(readProgress(storage,catalog()),{assetId:'chapter-01.json',ratio:.4});assert.deepEqual(Object.keys(JSON.parse(m.get(PROGRESS_KEY))),['assetId','ratio']);resetProgress(storage);assert.equal(m.get('library-progress'),'public');assert.equal(m.has(PROGRESS_KEY),false);});
test('passwordless mail is explicit, login-gated, creates no account',async()=>{const {r,calls}=fixture(()=>new Response(null,{status:200}));await assert.rejects(r.sendLink('invalid-email'));assert.equal(calls.length,0);await r.sendLink(config.ownerEmail);assert.deepEqual(JSON.parse(calls[0].options.body),{email:config.ownerEmail,create_user:false});assert.ok(calls[0].url.includes('redirect_to='));r.config={...config,loginEnabled:false};await assert.rejects(r.sendLink(config.ownerEmail));assert.equal(calls.length,1);});
test('unknown asset and path injection reject with no asset request',async()=>{const {r,calls}=fixture();r.setSession('jwt',30);await assert.rejects(r.chapter('../chapter-01.json'));assert.ok(calls.every(c=>!c.url.includes('/asset/')));r.lock();});

test('other authenticated account still needs server entitlement; email flags never grant',async()=>{const {r,calls}=fixture(url=>url.endsWith('/user')?json({id:'stranger',email:'other@example.test'}):url.endsWith('/catalog')?json({},404):null);r.setSession('valid-other-user',30);await assert.rejects(r.validate(),e=>e.status===404);assert.equal(r.token,null);assert.ok(calls.every(c=>!c.url.includes('/asset/')));});

test('logout revokes only current session and clears before the network response',async()=>{const {r,calls}=fixture(()=>new Response(null,{status:204}));r.setSession('jwt',30);const promise=r.logout();assert.equal(r.token,null);await promise;assert.equal(calls[0].url,'https://auth.test/auth/v1/logout?scope=local');});

test('offline listener saves position, invalidates navigation, locks and clears catalog',async()=>{
  const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
  const source=readFileSync(new URL('../reader-test/app.mjs',import.meta.url),'utf8');
  const listener=source.split('\n').find(line=>line.startsWith("window.addEventListener('offline',"));assert.ok(listener);
  let callback,saved=0,locked=0,message='';
  const context={window:{addEventListener:(name,fn)=>{assert.equal(name,'offline');callback=fn;}},storePosition:()=>saved++,reader:{lock:()=>locked++},navigation:4,catalog:{bookId:'slow-down'},say:text=>message=text};
  runInNewContext(listener,context);callback();assert.equal(saved,1);assert.equal(locked,1);assert.equal(context.navigation,5);assert.equal(context.catalog,null);assert.ok(message.includes('网络已断开'));
});


test('default native fetch retains global receiver for OTP, protected requests and logout',async()=>{
  const original=globalThis.fetch, calls=[];
  globalThis.fetch=function(url,options){
    assert.equal(this,globalThis,'native browser fetch requires a global receiver');
    calls.push({url,options});
    return Promise.resolve(new Response(null,{status:200}));
  };
  let r;
  try{
    r=new ProtectedReader(config);
    await r.sendLink(config.ownerEmail);
    r.setSession('synthetic-test-token',30);
    await r.request(config.projectUrl+'/auth/v1/user','none');
    await r.logout();
    assert.equal(calls.length,3);
    assert.equal(calls[0].options.headers.Authorization,undefined);
    assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-test-token');
    assert.equal(calls[2].options.headers.Authorization,'Bearer synthetic-test-token');
    assert.equal(r.token,null);
  }finally{r?.lock();globalThis.fetch=original;}
});

test('explicit custom fetch remains injectable without accessing native fetch',async()=>{
  const original=globalThis.fetch;let called=0;
  globalThis.fetch=()=>{throw new Error('native fetch must not be used');};
  try{
    const r=new ProtectedReader(config,{fetcher:async()=>{called++;return new Response(null,{status:200});}});
    await r.sendLink(config.ownerEmail);assert.equal(called,1);
  }finally{globalThis.fetch=original;}
});
