// Acceptance against the minimized deployment artifact, never the production site.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit,devices}=require('playwright');
const base=process.env.LIBRARY_TEST_URL||'http://127.0.0.1:8765/library/';
const books=JSON.parse(fs.readFileSync('library/data/books.json','utf8'));
const expected=JSON.parse(fs.readFileSync('library/data/chapters/slow-shutter-full/chapter-01.json','utf8'));
(async()=>{
 fs.mkdirSync('/tmp/slow-shutter-browser',{recursive:true});
 for(const [name,type,options] of [['desktop',chromium,{viewport:{width:1440,height:960}}],['iphone-webkit',webkit,{...devices['iPhone 13']}]] ){
  const browser=await type.launch({headless:true});const context=await browser.newContext(options);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   await page.goto(base+'#/book/slow-shutter');await page.waitForSelector('.book-toc');
   assert.equal(await page.locator('.book-toc > li').count(),9);assert.equal(await page.locator('.chapter-listen-link').count(),1);
   await page.goto(base+'#/read/slow-shutter/chapter-01');await page.waitForSelector('.reader-main');
   const text=await page.locator('.reader-main').innerText();for(const block of expected.blocks)if(block.text)assert.ok(text.includes(block.text),block.type);
   assert.match(await page.locator('.sample-paywall a.primary-link').innerText(),/查看购买预览/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`/tmp/slow-shutter-browser/${name}-chapter.png`,fullPage:true});
   for(const query of ['', '?listen=1&from=start','?resume=1','?section=heading']){
    await page.goto(base+'#/read/slow-shutter/chapter-02'+query);await page.waitForSelector('.purchase-page');
    assert.equal(await page.locator('.reader-main').count(),0);assert.equal(await page.locator('a[href="/reader-test/"]').count(),0);
   }
   // Raw HTTP, with no SW or cache, must deny every retired second-book resource.
   const retired=JSON.parse(fs.readFileSync('scripts/public-site-policy.json')).excludedPilotFiles.filter(p=>p.includes('slow-shutter'));
   for(const p of retired){const response=await context.request.get(new URL(p.replace(/^library\//,''),base).href);assert.equal(response.status(),404,p);}
   await page.goto(base);await page.waitForSelector('#book-search');await page.locator('#book-search').fill('关于模糊');
   assert.equal(await page.locator('.book-card:visible').count(),1);assert.equal(await page.locator('a[href*="read/slow-shutter/chapter-02"]').count(),0);
   await page.locator('#book-search').fill('');await page.locator('[data-local-download="slow-shutter"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-local-download="slow-shutter"]')?.textContent==='删除第一章离线副本');
   const record=await page.evaluate(async()=>{for(const name of await caches.keys()){const r=await (await caches.open(name)).match(new URL('offline-complete',location.href));if(r){const d=await r.json();if(d.id==='slow-shutter')return d;}}});
   assert.deepEqual(record.chapterIds,['chapter-01']);assert.equal(record.urls.length,2);
   // Simulate a legacy full download with late bytes; new worker must clean it.
   await page.evaluate(async()=>{localStorage.setItem('shadow-library:reading:slow-shutter',JSON.stringify({chapter:'chapter-02',fraction:.5}));const c=await caches.open('shadow-library-book-v1-slow-shutter-legacy');const locked=new URL('data/chapters/slow-shutter-full/chapter-02.json',location.href).href;await c.put(locked,new Response('legacy secret'));await c.put(new URL('offline-complete',location.href),new Response(JSON.stringify({id:'slow-shutter',scope:'full',urls:[locked]})));await fetch(locked);});
   const lockedKeys=await page.evaluate(async()=>{await fetch('data/books.json');const result=[];for(const name of await caches.keys())if(name.startsWith('shadow-library-'))for(const req of await (await caches.open(name)).keys())if(req.url.includes('slow-shutter-full/')&&!req.url.includes('chapter-01.json'))result.push(req.url);return result;});assert.deepEqual(lockedKeys,[]);
   await context.setOffline(true);await page.goto(base+'#/read/slow-shutter/chapter-01');await page.waitForSelector('.reader-main');
   await page.goto(base+'#/read/slow-shutter/chapter-02?listen=1');await page.waitForSelector('.purchase-page');
   await context.setOffline(false);await page.goto(base+'#/read/slow-down/chapter-01');await page.waitForSelector('.reader-main');
   await page.goto(base+'#/read/slow-down/chapter-02');await page.waitForSelector('.purchase-page');
   assert.deepEqual(errors,[]);console.log(name+': PASS');
  }finally{await page.screenshot({path:`/tmp/slow-shutter-browser/${name}-last.png`,fullPage:true}).catch(()=>{});await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1)});
