// Acceptance against the minimized deployment artifact, never the production site.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit,devices}=require('playwright');
const base=process.env.LIBRARY_TEST_URL||'http://127.0.0.1:8765/library/';
const books=JSON.parse(fs.readFileSync('library/data/books.json','utf8'));

(async()=>{
 fs.mkdirSync('/tmp/slow-shutter-browser',{recursive:true});
 for(const [name,type,options] of [['desktop',chromium,{viewport:{width:1440,height:960}}],['iphone-webkit',webkit,{...devices['iPhone 13']}]] ){
  const browser=await type.launch({headless:true});for(const book of books.filter(b=>b.commerce?.mode==='pilot')){
  const id=book.id,sample=book.chapters.find(ch=>ch.id==='chapter-01'),expected=JSON.parse(fs.readFileSync('library/'+sample.file,'utf8'));const context=await browser.newContext(options);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   await page.goto(base+`#/book/${id}`);await page.waitForSelector('.book-toc');
   assert.equal(await page.locator('.book-toc > li').count(),book.chapters.length);assert.equal(await page.locator('.chapter-listen-link').count(),1);
   await page.goto(base+`#/read/${id}/chapter-01`);await page.waitForSelector('.reader-main');
   const text=await page.locator('.reader-main').innerText();for(const block of expected.blocks)if(block.text)assert.ok(text.replace(/\s+/g,'').includes(block.text.replace(/\s+/g,'')),id+':'+block.type);
   for(const img of await page.locator('.reader-main img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>{if(!el.complete||!el.naturalWidth)return new Promise((resolve,reject)=>{el.onload=resolve;el.onerror=()=>reject(Error('sample image failed'));});});}
   await page.locator('.reader-main').evaluate(el=>el.scrollIntoView());
   assert.match(await page.locator('.sample-paywall a.primary-link').innerText(),/查看购买预览/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`/tmp/slow-shutter-browser/${name}-${id}-chapter.png`,fullPage:false});
   await page.locator('.sample-paywall').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/slow-shutter-browser/${name}-${id}-continuation.png`,fullPage:false});
   for(const query of ['', '?listen=1&from=start','?resume=1','?section=heading']){
    await page.goto(base+`#/read/${id}/chapter-02`+query);await page.waitForSelector('.purchase-page');
    assert.equal(await page.locator('.reader-main').count(),0);if(id!=='slow-down')assert.equal(await page.locator('a[href="/reader-test/"]').count(),0);
   }
   // Raw HTTP, with no SW or cache, must deny every retired second-book resource.
   const retired=JSON.parse(fs.readFileSync('scripts/public-site-policy.json')).excludedPilotFiles.filter(p=>p.includes(`${id}`));
   for(const p of retired){const response=await context.request.get(new URL(p.replace(/^library\//,''),base).href);assert.equal(response.status(),404,p);}
   await page.goto(base);await page.waitForSelector('#book-search');await page.locator('#book-search').fill(book.chapters.find(ch=>ch.id==='chapter-02').title);
   assert.equal(await page.locator('.book-card:visible').count(),1);assert.equal(await page.locator(`a[href*="read/${id}/chapter-02"]`).count(),0);
   await page.locator('#book-search').fill('');await page.locator(`[data-local-download="${id}"]`).click();
   await page.waitForFunction(id=>document.querySelector(`[data-local-download="${id}"]`)?.textContent==='删除第一章离线副本',id);
   const record=await page.evaluate(async id=>{for(const name of await caches.keys()){const r=await (await caches.open(name)).match(new URL('offline-complete',location.href));if(r){const d=await r.json();if(d.id===id)return d;}}},id);
   assert.deepEqual(record.chapterIds,['chapter-01']);assert.equal(record.urls.length,id==='slow-down'?6:id==='structure'?4:2);
   // Simulate a legacy full download with late bytes; new worker must clean it.
   const retiredURLs=retired.map(p=>new URL(p.replace(/^library\//,''),base).href);
   await page.evaluate(async({id,urls})=>{localStorage.setItem('shadow-library:reading:'+id,JSON.stringify({chapter:'chapter-02',fraction:.5}));const c=await caches.open('shadow-library-book-v1-'+id+'-legacy');for(const url of urls)await c.put(url,new Response('legacy secret'));await c.put(new URL('offline-complete',location.href),new Response(JSON.stringify({id,scope:'full',urls})));await fetch(urls[0]);},{id,urls:retiredURLs});
   const lockedKeys=await page.evaluate(async urls=>{await fetch('data/books.json');const result=[];for(const name of await caches.keys())if(name.startsWith('shadow-library-'))for(const req of await (await caches.open(name)).keys())if(urls.includes(req.url))result.push(req.url);return result;},retiredURLs);assert.deepEqual(lockedKeys,[]);
   await context.setOffline(true);await page.goto(base+`#/read/${id}/chapter-01`);await page.waitForSelector('.reader-main');
   if(name==='desktop'){await page.reload();await page.waitForSelector('.reader-main');}
   else console.log('iPhone Safari cold reload: unverified; emulated WebKit offline reload emits an internal engine error');
   await page.goto(base+`#/read/${id}/chapter-02?listen=1`);await page.waitForSelector('.purchase-page');
   await context.setOffline(false);await page.goto(base+'#/read/slow-down/chapter-01');await page.waitForSelector('.reader-main');
   await page.goto(base+'#/read/slow-down/chapter-02');await page.waitForSelector('.purchase-page');
   assert.deepEqual(errors,[]);console.log(name+' '+id+': PASS');
  }catch(error){console.log(name+' diagnostic',await page.evaluate(async()=>({body:document.body.innerText,controller:!!navigator.serviceWorker.controller,keys:await caches.keys(),errors:[] })).catch(()=>null));console.log(name+' pageerrors',errors);throw error;}finally{await page.screenshot({path:`/tmp/slow-shutter-browser/${name}-${id}-last.png`,fullPage:false}).catch(()=>{});await context.close();}
  }await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
