const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const books=JSON.parse(read('library/data/books.json')), pilot=books[0];
function boot(){
 const c={URL,URLSearchParams,books,platform:{name:'Test'},storage:{get:()=>null},isSaved:()=>false,isDownloaded:()=>false,matchMedia:()=>({matches:false}),window:{ShadowAnalytics:null,scrollTo(){}},mountLibraryApp(){},downloadedChapter:async()=>null,bindReader(){return ()=>{}},fetch:async()=>{throw Error('unexpected fetch')},location:{hash:'',replace(url){this.redirect=url}},document:{body:{classList:{remove(){},add(){}}},querySelector:()=>({setAttribute(){},removeAttribute(){},focus(){}})}};
 vm.createContext(c);
 vm.runInContext(read('library/src/components.js').replaceAll('export ',''),c);
 vm.runInContext('Object.assign(globalThis,{canAccessChapter,accessibleChapters,chapterURL});',c);
 vm.runInContext("const e=escapeHTML; let cleanup=()=>{},renderVersion=0; const viewer={open:false}; const main={innerHTML:'',focus(){}}; const chapterCache=new Map();",c);
 const app=read('library/src/app.js');
 vm.runInContext(app.slice(app.indexOf('function appleBooksLink'),app.lastIndexOf('\ntry{')),c);
 return c;
}
test('A: full TOC, chapter one opens; every other chapter and subsection leads to preview',()=>{
 const c=boot(), html=c.tocItems(pilot);
 for(const chapter of pilot.chapters){
  assert.equal(c.canAccessChapter(pilot,chapter.id),chapter.id==='chapter-01');
  assert.ok(html.includes(chapter.title));
  assert.equal(c.chapterURL(pilot,chapter.id),chapter.id==='chapter-01'?'#/read/slow-down/chapter-01':'#/purchase/slow-down');
  if(chapter.id!=='chapter-01')assert.ok(!html.includes(`#/read/slow-down/${chapter.id}`));
 }
 assert.ok(html.includes('🔒 尚未开放'));
});
test('B/F: direct URLs, old deep links, sections, resume and narration guarded before fetch',async()=>{
 const c=boot();let fetches=0;c.fetch=async()=>{fetches++;throw Error('must not fetch')};
 for(const id of ['chapter-02','preface','front-matter','author-note','conclusion','legacy-chapter'])for(const query of ['','?listen=1&from=start','?resume=1','?section=heading-83']){
  c.location.hash=`#/read/slow-down/${id}${query}`;c.location.redirect=null;
  await c.render();assert.equal(c.location.redirect,'#/purchase/slow-down');
 }
 assert.equal(fetches,0);
});
test('C/D: chapter title search returns book, old progress routes preview without erasing data',()=>{
 const c=boot(),saved={chapter:'chapter-02',fraction:.45,percent:20};
 c.storage.get=key=>key==='reading:slow-down'?saved:null;
 assert.equal(c.matchesShelf(pilot,'慢门从何而来'),true);
 for(const html of [c.shelfTools(),c.bookPage(pilot)]){
  assert.ok(html.includes('#/purchase/slow-down'));
  assert.ok(!html.includes('#/read/slow-down/chapter-02'));
 }
 assert.equal(c.savedReading(pilot),saved);
});
test('G: chapter end is calm continuation, no whole-book completion; progress denominator unchanged',()=>{
 const c=boot();c.listenPanel=()=>'';
 vm.runInContext(read('library/src/reader.js').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
 const chapter=JSON.parse(read('library/'+pilot.chapters.find(x=>x.id==='chapter-01').file));
 const html=c.renderReader(pilot,chapter,3);
 assert.ok(html.includes('CONTINUE READING'));assert.ok(html.includes('查看购买预览'));
 assert.ok(!/全书已读完|FREE SAMPLE|免费试读到此结束/.test(html));
 assert.ok(html.includes('4 / 22 节'));
 assert.match(read('library/src/reader.js'),/\(index\+fraction\)\/book\.chapters\.length\*100/);
 assert.equal(c.renderReader(pilot,{id:'chapter-02'},4),'');
});
test('unknown prices are pending, explicit zero stays zero, synopsis and CTA are present',()=>{
 const c=boot();
 for(const price of [null,undefined,'',' ',NaN,'bad',false,{},-1])assert.equal(c.purchaseLabel({commerce:{price}}),'即将开放 · 价格待定');
 assert.equal(c.purchaseLabel({commerce:{price:0,currency:'AUD'}}),'购买完整版 · AUD 0.00');
 const html=c.bookPage(pilot);assert.ok(html.includes('ABOUT THIS BOOK'));assert.ok(html.includes(pilot.commerce.abstract));assert.ok(html.includes('开始阅读 / Start Reading'));assert.ok(!html.includes('Read Sample'));
});
test('narration and downloadable chapter policy only include first chapter; other four books unchanged',()=>{
 const c=boot();assert.deepEqual(Array.from(c.accessibleChapters(pilot),x=>x.id),['chapter-01']);
 assert.deepEqual(Array.from(c.listeningChapters(pilot),x=>x.id),['chapter-01']);
 assert.equal(c.firstListeningChapter(pilot).id,'chapter-01');
 for(const book of books.slice(2))for(const chapter of book.chapters||[])assert.equal(c.canAccessChapter(book,chapter.id),true);
 assert.ok(!c.listeningHome().includes('#/read/slow-down/chapter-02'));
});
test('current public source contains only approved sample; history remains a separate risk',()=>{
 const policy=JSON.parse(read('scripts/public-site-policy.json'));
 for(const path of policy.excludedPilotFiles)assert.equal(fs.existsSync(path),false,path);
 for(const path of policy.pilotFiles)assert.ok(fs.existsSync(path),path);
 assert.match(read('library/src/components.js'),/not a server-side paywall/);
});
test('failed stale request does not overwrite a newer purchase screen',async()=>{
 const c=boot();let rejectFetch;
 c.fetch=()=>new Promise((resolve,reject)=>{rejectFetch=reject});
 c.location.hash='#/read/slow-down/chapter-01';const pending=c.render();
 c.location.hash='#/purchase/slow-down';await c.render();
 const purchase=vm.runInContext('main.innerHTML',c);
 rejectFetch(Error('late failure'));await pending;
 assert.equal(vm.runInContext('main.innerHTML',c),purchase);
 assert.match(purchase,/这是购买预览页/);
 assert.match(purchase,/href="\/reader-test\/"/);
});
test('HTML, module imports and catalogue exactly match service-worker precache keys',()=>{
 const sw=read('library/sw.js'), html=read('library/index.html');
 for(const asset of ['src/app.js?v=samples-20261009-1','src/styles.css?v=pilot-20261007-1']){assert.ok(html.includes(asset));assert.ok(sw.includes(asset));}
 const app=read('library/src/app.js');assert.ok(app.includes('data/books.json?v=samples-20261009-1'));assert.ok(sw.includes('data/books.json?v=samples-20261009-1'));
 for(const name of ['app','reader','listen','offline'])for(const [,asset] of read(`library/src/${name}.js`).matchAll(/from '\.\/([^']+)'/g))assert.ok(sw.includes('src/'+asset),`${name}: ${asset} not precached`);
});

test('second book: chapter one only across TOC, narration, deep links, search and saved progress',async()=>{
 const c=boot(), book=books[1], saved={chapter:'chapter-02',fraction:.6};
 assert.equal(book.commerce.price,null);assert.equal(book.commerce.purchaseStatus,'preview');
 assert.deepEqual(Array.from(c.accessibleChapters(book),x=>x.id),['chapter-01']);
 assert.deepEqual(Array.from(c.listeningChapters(book),x=>x.id),['chapter-01']);
 const toc=c.tocItems(book);for(const ch of book.chapters){assert.ok(toc.includes(ch.title));if(ch.id!=='chapter-01')assert.ok(!toc.includes(`#/read/slow-shutter/${ch.id}`));}
 let requests=0;c.fetch=async()=>{requests++;throw Error('locked body fetched')};
 for(const ch of book.chapters.filter(x=>x.id!=='chapter-01'))for(const query of ['','?listen=1','?resume=1','?section=heading']){
  c.location.hash=`#/read/slow-shutter/${ch.id}${query}`;await c.render();assert.equal(c.location.redirect,'#/purchase/slow-shutter');
 }assert.equal(requests,0);
 c.storage.get=k=>k==='reading:slow-shutter'?saved:null;
 assert.ok(c.matchesShelf(book,'关于模糊'));assert.ok(!c.bookPage(book).includes('#/read/slow-shutter/chapter-02'));assert.equal(c.savedReading(book),saved);
 c.location.hash='#/purchase/slow-shutter';await c.render();
 assert.ok(!vm.runInContext('main.innerHTML',c).includes('/reader-test/'));
 c.listenPanel=()=>'';vm.runInContext(read('library/src/reader.js').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
 const chapter=JSON.parse(read('library/data/chapters/slow-shutter-full/chapter-01.json'));
 const rendered=c.renderReader(book,chapter,3);assert.ok(rendered.includes('查看购买预览'));assert.equal(c.renderReader(book,{id:'chapter-02'},4),'');
});
