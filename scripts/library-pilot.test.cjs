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
 for(const book of books.filter(b=>b.commerce?.mode!=='pilot'))for(const chapter of book.chapters||[])assert.equal(c.canAccessChapter(book,chapter.id),true);
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
 for(const asset of ['src/app.js?v=samples-20261009-3','src/styles.css?v=pilot-20261007-1']){assert.ok(html.includes(asset));assert.ok(sw.includes(asset));}
 const app=read('library/src/app.js');assert.ok(app.includes('data/books.json?v=samples-20261009-3'));assert.ok(sw.includes('data/books.json?v=samples-20261009-3'));
 for(const name of ['app','reader','listen','offline'])for(const [,asset] of read(`library/src/${name}.js`).matchAll(/from '\.\/([^']+)'/g))assert.ok(sw.includes('src/'+asset),`${name}: ${asset} not precached`);
});

for(const book of books.filter(b=>b.id!=='slow-down'&&b.commerce?.mode==='pilot'))test(book.id+': chapter one only across TOC, narration, deep links, search and saved progress',async()=>{
 const c=boot(), saved={chapter:'chapter-02',fraction:.6};
 assert.equal(book.commerce.price,null);assert.equal(book.commerce.purchaseStatus,'preview');
 assert.deepEqual(Array.from(c.accessibleChapters(book),x=>x.id),['chapter-01']);
 assert.deepEqual(Array.from(c.listeningChapters(book),x=>x.id),['chapter-01']);
 const toc=c.tocItems(book);for(const ch of book.chapters){assert.ok(toc.includes(ch.title));if(ch.id!=='chapter-01')assert.ok(!toc.includes(`#/read/${book.id}/${ch.id}`));}
 let requests=0;c.fetch=async()=>{requests++;throw Error('locked body fetched')};
 for(const ch of book.chapters.filter(x=>x.id!=='chapter-01'))for(const query of ['','?listen=1','?resume=1','?section=heading']){
  c.location.hash=`#/read/${book.id}/${ch.id}${query}`;await c.render();assert.equal(c.location.redirect,`#/purchase/${book.id}`);
 }assert.equal(requests,0);
 c.storage.get=k=>k===`reading:${book.id}`?saved:null;
 assert.ok(c.matchesShelf(book,book.chapters.find(ch=>ch.id==='chapter-02').title));assert.ok(!c.bookPage(book).includes(`#/read/${book.id}/chapter-02`));assert.equal(c.savedReading(book),saved);
 c.location.hash=`#/purchase/${book.id}`;await c.render();
 assert.ok(!vm.runInContext('main.innerHTML',c).includes('/reader-test/'));
 c.listenPanel=()=>'';vm.runInContext(read('library/src/reader.js').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
 const chapter=JSON.parse(read('library/'+book.chapters.find(ch=>ch.id==='chapter-01').file));
 const rendered=c.renderReader(book,chapter,book.chapters.findIndex(ch=>ch.id===chapter.id));assert.ok(rendered.includes('查看购买预览'));assert.equal(c.renderReader(book,{id:'chapter-02'},4),'');
});

test('fourth-book V2.1b import preserves every first-chapter page and all five exact source images',()=>{
 const crypto=require('node:crypto'),book=books.find(b=>b.id==='metabolism');
 const chapter=JSON.parse(read('library/'+book.chapters.find(ch=>ch.id==='chapter-01').file));
 assert.equal(book.author,'刘伟宏 医生');assert.equal(book.chapters.length,16);
 assert.equal(chapter.source.sha256,"8c582831d44d2de4db4a2d7a4fd45a541de467e86d339d1f3643083f024596e8");
 assert.deepEqual(chapter.source.pages,Array.from({length:16},(_,i)=>i+10));
 const expected=["649619aa9b5a0c3098b37ce52a5c85bde0cdf635a2c1708307a8f499a41e860b", "448909a7907821f1daedb987964654b6bfb998b7b41b728e274928f0d22e7323", "5322eb0f8bbb51264a716ead273bdcfe3c19f55ee8a4491cb14c248e316b5555", "247895b8471226845b7f34902446932a16e5c4657a6200662565333e12ca30cf", "279d7ae7db6d5c8b381a28e4402c546446cefdc11404e686562cd92f9e471ff9", "0e7f027114c229e598ec8168014b497ebe0347d9f9ff76564b142c2f42cea28f", "671b11baf389a8616fd4f445c876651365dc7ef5c73e7c120419442d524dac91", "ab77d7677e43394c9810bb44b5544e7c906249e01b1b77f0d91ab8b93553d2ba", "e2cadb476eca0521b6b7e208dd37b4c7beb55adb30158e219c7e9f2da25bd558", "985ea430d97970a782d6540ce31168840a90bcd21b8534ccf13fe903d16b6294", "d97a6571293242dbb7651e7c7ca0c87991cee59be272241778f6d123bc62a9b7", "1c41a75a5eb1cedb418795e514bfb33e0ffe415baef9846171153a46c8d1d322", "6b80d4dd25b8861e136c9d192246b0276c55f5d1e8e088a63c5bead593547eb3", "5da01a704687cc98f880843a54abd3afadeda01ab86f03829ca0c17ac5698440", "95a8d0fc3e8900905500bb436df9f2a2b13e2323164b05fe4b2fb5d93e117d7e", "4f4db10f23d3d72af2ddfeb66abd05912a5a6de038ffa87f4f4b251acdeee4eb"];
 for(let page=10;page<=25;page++){
  const text=chapter.blocks.filter(b=>b.sourcePage===page).map(b=>b.type==='image'?b.caption:b.text||'').join('').replace(/\s/g,'');
  assert.equal(crypto.createHash('sha256').update(text).digest('hex'),expected[page-10]);
 }
 const images=chapter.blocks.filter(b=>b.type==='image');assert.equal(images.length,5);
 const policy=JSON.parse(read('scripts/public-site-policy.json'));
 for(const img of images){assert.equal(img.src,img.fullSrc);const path='library/'+img.src,raw=fs.readFileSync(path);assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex'),policy.opaqueGitBlobs[path]);}
 assert.match(chapter.blocks.at(-1).text,/医学提示/);
 for(const ch of book.chapters)assert.equal(fs.existsSync('library/'+ch.file),ch.id==='chapter-01');
});
