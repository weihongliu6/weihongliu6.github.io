// Run against `python -m http.server 8765` at the repository root.
// Requires Playwright and Chromium. Optional LIBRARY_BROWSER_EXECUTABLE overrides the binary.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LIBRARY_BROWSER_EXECUTABLE?{executablePath:process.env.LIBRARY_BROWSER_EXECUTABLE,args:['--no-sandbox']}: {})});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 context.setDefaultTimeout(30000);
 let page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const base=process.env.LIBRARY_TEST_URL||'http://127.0.0.1:8765/library/';
 try{
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.includes('已准备好'));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.locator('#install-library').click();assert.equal(await page.locator('#install-help').getAttribute('open'),'');
  await page.locator('[data-local-save="slow-down"]').click();
  await page.locator('#show-my-books').click();assert.equal(await page.locator('.book-card:visible').count(),1);
  await page.reload();assert.equal(await page.locator('[data-local-save="slow-down"]').getAttribute('aria-pressed'),'true');
  await page.locator('#book-search').fill('no-such-book');assert.equal(await page.locator('.book-card:visible').count(),0);
  await page.locator('#book-search').fill('慢门摄影的技术基础');assert.equal(await page.locator('.book-card:visible').count(),1);
  await page.locator('#book-search').fill('');
  await page.locator('[data-local-download="slow-down"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-local-download="slow-down"]')?.textContent==='删除离线副本',{},{timeout:120000});
  const records=await page.evaluate(async()=>{const result=[];for(const name of await caches.keys())if(name.startsWith('shadow-library-book-')){const cache=await caches.open(name);const record=await cache.match(new URL('offline-complete',location.href));if(record)result.push(await record.json());}return result;});
  const book=records.find(x=>x.id==='slow-down');assert.ok(book?.urls.length>60);assert.ok(book.bytes>1000000);
  // Close the page and disable the network: this must not depend on in-memory chapter state.
  await page.close();await context.setOffline(true);page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('[data-local-download="slow-down"]')?.textContent==='删除离线副本');
  await page.locator('#book-filter').selectOption('downloaded');assert.equal(await page.locator('.book-card:visible').count(),1);
  await page.goto(base+'#/read/slow-down/chapter-01');await page.waitForSelector('.reader-main');
  const checks=await page.evaluate(async urls=>{const results=[];for(const url of urls){try{const r=await fetch(url);results.push(r.ok);}catch{results.push(false);}}return results;},book.urls);
  assert.ok(checks.every(Boolean),'all chapters and full-size images should resolve offline');
  await page.reload();await page.waitForSelector('.reader-main');
  await page.goto(base);await page.waitForSelector('[data-local-download="slow-down"]');
  await page.locator('[data-local-download="slow-down"]').click();await page.waitForFunction(()=>document.querySelector('[data-local-download="slow-down"]')?.textContent==='离线下载'||document.querySelector('[data-local-download="slow-down"]')?.textContent==='↓ 离线下载');
  assert.equal(await page.locator('[data-local-save="slow-down"]').getAttribute('aria-pressed'),'true');
  // A failed offline download must not be recorded as complete.
  await page.locator('[data-local-download="structure"]').click();await page.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.includes('下载未完成'));
  assert.equal(await page.locator('[data-local-download="structure"]').textContent(),'↓ 离线下载');
  await context.setOffline(false);
  await page.locator('[data-local-download="structure"]').click();
  await page.locator('[data-local-download="structure"]').click();
  await page.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.includes('已取消'));
  await page.evaluate(()=>{window.originalCacheOpen=caches.open.bind(caches);caches.open=async name=>name.startsWith('shadow-library-book-')?{put:async()=>{throw new DOMException('quota','QuotaExceededError')}}:window.originalCacheOpen(name);});
  await page.locator('[data-local-download="structure"]').click();
  await page.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.includes('空间不足'));
  await page.evaluate(()=>{caches.open=window.originalCacheOpen;});
  await page.locator('[data-local-download="slow-shutter"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-local-download="slow-shutter"]')?.textContent==='删除离线副本',{},{timeout:120000});

  await page.setViewportSize({width:390,height:844});await page.reload();await page.waitForSelector('#local-library');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile page must not overflow');
  await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
  if(process.env.LIBRARY_SCREENSHOT)await page.screenshot({path:process.env.LIBRARY_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: install fallback, saved shelf, search, download, offline fresh page/reload, all book assets, removal, failure, cancellation, quota error, inline images, mobile layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
