const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.mjs':'text/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;let file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
const catalog={bookId:'slow-down',sections:Array.from({length:22},(_,n)=>({id:n===0?'front-matter':`chapter-${String(n).padStart(2,'0')}`,assetId:`section-${n}.json`,title:`测试条目 ${n+1}`})),images:Array.from({length:49},(_,n)=>({assetId:`image-${n}.jpg`,sourceRef:`assets/books/test/image-${n}.jpg`}))};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
 const context=await browser.newContext({viewport});const page=await context.newPage();let denied=false, malicious=false, delay=false, calls=[];const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://vyhhzhayloesxvosbwtc.supabase.co/**',async route=>{
  const url=route.request().url();calls.push(url);assert.ok(!url.includes('jwt-test'));let data;
  if(url.endsWith('/user'))data={id:'00000000-0000-4000-8000-000000000001',email:'author@example.invalid'};
  else if(url.endsWith('/catalog')){if(denied)return route.fulfill({status:404,contentType:'application/json',body:'{}'});data=catalog;}
  else if(url.includes('/asset/section-')){const n=Number(url.match(/section-(\d+)/)[1]);if(delay&&n===2)await new Promise(r=>setTimeout(r,200));data={id:catalog.sections[n].id,title:catalog.sections[n].title,blocks:[{type:'paragraph',text:`Synthetic body ${n} <script>throw 1</script>`},...(malicious?[{type:'image',src:'https://evil.test/leak.jpg'}]:[])]};}
  else if(url.endsWith('/logout?scope=local'))return route.fulfill({status:204});
  else throw new Error('Unexpected external fetch '+url);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin+'/reader-test/');assert.equal(await page.locator('#reader').isVisible(),false);assert.equal(await page.locator('#login').isDisabled(),true);assert.equal(calls.length,0);
 await page.screenshot({path:path.join(root,`unauth-${viewport.width}.png`),fullPage:true});
 await page.goto(origin+'/reader-test/#access_token=jwt-test&expires_in=120&refresh_token=discard-me');await page.locator('#reader').waitFor({state:'visible'});assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#toc button').count(),22);
 await page.evaluate(()=>localStorage.setItem('library-progress','preserved'));
 await page.click('#start');await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('Synthetic body 1'));assert.equal(await page.locator('#content script').count(),0);
 assert.ok((await page.locator('#position').textContent()).includes('/ 22'));
 await page.screenshot({path:path.join(root,`reading-${viewport.width}.png`),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.click('#reset');assert.equal(await page.evaluate(()=>localStorage.getItem('library-progress')),'preserved');
 delay=true;await page.locator('#toc button').nth(2).click();await page.waitForTimeout(20);
 // Trigger a newer navigation programmatically while pending content keeps controls hidden.
 await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(350);
 assert.ok((await page.locator('#content').textContent()).includes('Synthetic body 1'));
 denied=true;await page.click('#next');await page.waitForFunction(()=>document.querySelector('#reader').hidden);assert.equal(await page.locator('#content').textContent(),'');
 denied=false;await page.goto(origin+'/reader-test/#access_token=jwt-test&expires_in=120');await page.locator('#reader').waitFor({state:'visible'});malicious=true;await page.click('#start');await page.waitForFunction(()=>document.querySelector('#reader').hidden);assert.equal(await page.locator('#content').textContent(),'');assert.ok(calls.every(url=>url.startsWith('https://vyhhzhayloesxvosbwtc.supabase.co/')));
 malicious=false;await page.goto(origin+'/reader-test/#access_token=jwt-test&expires_in=120');await page.locator('#reader').waitFor({state:'visible'});await page.click('#start');await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('Synthetic body'));await page.evaluate(()=>window.dispatchEvent(new Event('offline')));assert.equal(await page.locator('#content').textContent(),'');assert.equal(await page.locator('#reader').isVisible(),false);
 await page.goto(origin+'/reader-test/#access_token=jwt-test&expires_in=120');await page.locator('#reader').waitFor({state:'visible'});await page.click('#logout');assert.equal(await page.locator('#content').textContent(),'');
 const stored=await page.evaluate(()=>({...localStorage}));assert.ok(Object.values(stored).every(v=>!v.includes('jwt-test')&&!v.includes('Synthetic body')&&!v.includes('discard-me')));
 assert.equal((await page.evaluate(()=>navigator.serviceWorker.getRegistrations())).length,0);assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${viewport.width}px: locked shell, 22 sections, safe text, first chapter, metadata-only/reset isolation, navigation race, denial, malicious image, logout, no SW/token cache`);
 }}finally{await browser.close();server.close();}})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
